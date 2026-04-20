// POST /api/biotech/briefs/[id]/rfp/send
// Sends the finalized RFP to one or more CRO engagements via Resend.
// Body: { engagement_ids: string[] }
// - Formats all 10 RFP sections as a clean HTML email
// - Sends per CRO with CRO name personalized in subject
// - Saves engagement_messages record per CRO
// - Advances stage to rfp_sent
// Returns: { results: { engagement_id, cro_name, sent, error? }[] }

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { SECTION_KEYS, SECTION_META, type SectionKey } from '@biotech/prompts/rfp';

// ── HTML email formatter ──────────────────────────────────────────────────────

/** Applies inline formatting: **bold** and [TO BE SPECIFIED] highlighting. */
function applyInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[TO BE SPECIFIED[^\]]*\]/g,
      match => `<strong style="color:#d97706;background:#fef3c7;padding:1px 4px;border-radius:3px">${match}</strong>`,
    );
}

/**
 * Converts a section's markdown-ish text into HTML for email.
 * Handles: # headings, ## subheadings, - bullet lists, 1. numbered lists,
 * **bold**, [TO BE SPECIFIED] highlights, and plain paragraphs.
 */
function markdownToEmailHtml(rawText: string): string {
  // Escape HTML entities first
  const escaped = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const blocks = escaped.split(/\n{2,}/);

  return blocks.map(block => {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';
    const first = lines[0].trim();

    // # Heading
    if (first.startsWith('# ')) {
      return `<h3 style="font-size:14px;font-weight:700;color:#1e1b4b;margin:20px 0 6px 0;padding:0">${applyInline(first.slice(2))}</h3>`;
    }

    // ## Subheading
    if (first.startsWith('## ')) {
      return `<h4 style="font-size:13px;font-weight:600;color:#374151;margin:14px 0 4px 0;padding:0">${applyInline(first.slice(3))}</h4>`;
    }

    // Bullet list
    const isBullet = lines.every(l => /^[-*]\s/.test(l.trim()));
    if (isBullet) {
      const items = lines.map(l =>
        `<li style="margin:0 0 5px 0;line-height:1.7">${applyInline(l.trim().replace(/^[-*]\s+/, ''))}</li>`
      ).join('');
      return `<ul style="margin:0 0 0.9em 0;padding-left:20px">${items}</ul>`;
    }

    // Numbered list
    const isNumbered = lines.every(l => /^\d+\.\s/.test(l.trim()));
    if (isNumbered) {
      const items = lines.map(l =>
        `<li style="margin:0 0 5px 0;line-height:1.7">${applyInline(l.trim().replace(/^\d+\.\s+/, ''))}</li>`
      ).join('');
      return `<ol style="margin:0 0 0.9em 0;padding-left:20px">${items}</ol>`;
    }

    // Plain paragraph
    const content = lines.map(l => applyInline(l)).join('<br>');
    return `<p style="margin:0 0 0.9em 0;line-height:1.7">${content}</p>`;
  }).join('');
}

function rfpToHtml(
  rfpDoc: Record<string, unknown>,
  companyName: string,
  croName: string,
): string {
  const sectionBlocks = SECTION_KEYS.map(key => {
    const text = (rfpDoc[key] as string | null) ?? '';
    if (!text) return '';

    const bodyHtml = markdownToEmailHtml(text);

    return `
      <div style="margin-bottom:28px">
        <h2 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;
                   color:#4f46e5;border-bottom:1px solid #e0e7ff;padding-bottom:6px;margin:0 0 14px 0">
          ${SECTION_META[key].label}
        </h2>
        <div style="font-size:14px;color:#1e293b">${bodyHtml}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:720px;margin:0 auto;padding:32px 16px">

    <!-- Cover band -->
    <div style="background:#1e1b4b;border-radius:12px 12px 0 0;padding:28px 36px;margin-bottom:0">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.1em;
                text-transform:uppercase;color:#a5b4fc">Request for Proposal</p>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3">
        ${rfpDoc.rfp_id ?? 'RFP'} — Preclinical Study Proposal Request
      </h1>
      <p style="margin:0;font-size:13px;color:#c7d2fe">
        Issued by <strong>${companyName}</strong> · Addressed to <strong>${croName}</strong>
      </p>
    </div>

    <!-- Notice bar -->
    <div style="background:#ede9fe;border:1px solid #c4b5fd;border-top:none;
                padding:10px 36px;font-size:12px;color:#5b21b6;margin-bottom:32px">
      ⚠ <strong>CONFIDENTIAL</strong> — This document contains proprietary information.
      Do not share with third parties. An NDA must be in place prior to study award.
    </div>

    <!-- Sections -->
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:36px">
      ${sectionBlocks}
    </div>

    <!-- Footer -->
    <div style="padding:20px 0 0;text-align:center;font-size:11px;color:#94a3b8">
      Sent via BiotechOS · ${companyName} · All rights reserved
    </div>
  </div>
</body>
</html>`;
}

function rfpToPlainText(rfpDoc: Record<string, unknown>): string {
  return SECTION_KEYS
    .map(key => {
      const text = (rfpDoc[key] as string | null) ?? '';
      if (!text) return '';
      return `${SECTION_META[key].label}\n${'─'.repeat(50)}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n\n');
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  let body: { engagement_ids?: string[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const engagementIds = body.engagement_ids;
  if (!Array.isArray(engagementIds) || engagementIds.length === 0) {
    return NextResponse.json({ error: 'engagement_ids array required' }, { status: 400 });
  }

  // ── Load brief + RFP doc ─────────────────────────────────────────────────
  const [{ data: brief }, { data: rfpDoc }] = await Promise.all([
    supabase.from('rfp_internal_briefs').select('id, title').eq('id', briefId).eq('user_id', user.id).single(),
    supabase.from('rfp_documents').select('*').eq('brief_id', briefId).maybeSingle(),
  ]);

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  if (!rfpDoc) return NextResponse.json({ error: 'No RFP document found. Generate the RFP first.' }, { status: 404 });

  // ── Load sender settings ─────────────────────────────────────────────────
  const { data: settings } = await supabase
    .from('biotech_user_settings')
    .select('company_name, sender_display_name, sender_email')
    .eq('user_id', user.id)
    .maybeSingle();

  const companyName      = settings?.company_name        ?? '[Company Name]';
  const senderDisplay    = settings?.company_name ?? settings?.sender_display_name ?? (user.user_metadata?.full_name as string) ?? user.email!;
  const senderReplyTo    = settings?.sender_email        ?? user.email!;

  // ── Load requested engagements ───────────────────────────────────────────
  const { data: engagements } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage')
    .in('id', engagementIds)
    .eq('brief_id', briefId)
    .eq('user_id', user.id);

  if (!engagements || engagements.length === 0) {
    return NextResponse.json({ error: 'No matching engagements found' }, { status: 404 });
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const resendApiKey      = process.env.RESEND_API_KEY;
  const verifiedFromEmail = process.env.BIOTECH_OUTREACH_EMAIL ?? 'onboarding@resend.dev';

  const rfpDocRecord = rfpDoc as Record<string, unknown>;
  const rfpId        = (rfpDocRecord.rfp_id as string) ?? 'RFP';
  const plainText    = rfpToPlainText(rfpDocRecord);

  const results: { engagement_id: string; cro_name: string; sent: boolean; error?: string }[] = [];

  for (const eng of engagements) {
    const subject  = `${rfpId} — Preclinical Study RFP from ${companyName}`;
    const htmlBody = rfpToHtml(rfpDocRecord, companyName, eng.cro_name);

    try {
      if (!resendApiKey) throw new Error('RESEND_API_KEY not configured');

      const { Resend } = await import('resend');
      const resend     = new Resend(resendApiKey);

      // Build a standalone HTML attachment (self-contained, printable by CRO)
      const attachmentFilename = `${rfpId.replace(/\s+/g, '-')}.html`;

      const { data: sendData, error: sendError } = await resend.emails.send({
        from:    `${senderDisplay} via BiotechOS <${verifiedFromEmail}>`,
        replyTo: senderReplyTo,
        to:      eng.cro_email,
        subject,
        html:    htmlBody,
        text:    plainText,
        attachments: [{
          filename: attachmentFilename,
          content:  Buffer.from(htmlBody, 'utf-8'),
        }],
      });

      if (sendError) throw new Error(sendError.message);

      const resendMessageId = (sendData as { id?: string } | null)?.id ?? null;

      // Save engagement_messages record
      await supabase.from('engagement_messages').insert({
        engagement_id:    eng.id,
        direction:        'outbound',
        message_type:     'rfp',
        subject,
        body:             plainText,
        status:           'sent',
        sent_at:          new Date().toISOString(),
        resend_message_id: resendMessageId,
      });

      // Advance stage
      await supabase
        .from('cro_engagements')
        .update({ stage: 'rfp_sent', updated_at: new Date().toISOString() })
        .eq('id', eng.id);

      // Log
      await adminSupabase.from('email_logs').insert({
        user_id:         user.id,
        template_name:   'biotech_rfp_send',
        recipient_email: eng.cro_email,
        subject,
        status:          'sent',
      });

      results.push({ engagement_id: eng.id, cro_name: eng.cro_name, sent: true });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[rfp/send] Failed for ${eng.cro_name}:`, errMsg);

      // Still save a failed record so user can see it in the thread
      await supabase.from('engagement_messages').insert({
        engagement_id: eng.id,
        direction:     'outbound',
        message_type:  'rfp',
        subject,
        body:          plainText,
        status:        'failed',
      });

      await adminSupabase.from('email_logs').insert({
        user_id:         user.id,
        template_name:   'biotech_rfp_send',
        recipient_email: eng.cro_email,
        subject,
        status:          'failed',
        error_text:      errMsg,
      });

      results.push({ engagement_id: eng.id, cro_name: eng.cro_name, sent: false, error: errMsg });
    }
  }

  const allSent = results.every(r => r.sent);
  const anySent = results.some(r => r.sent);

  return NextResponse.json(
    { results, rfp_id: rfpId },
    { status: allSent ? 200 : anySent ? 207 : 500 },
  );
}

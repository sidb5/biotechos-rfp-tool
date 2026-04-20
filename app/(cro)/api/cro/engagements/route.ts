// POST /api/cro/engagements
// Two actions via ?action= query param:
//
//   ?action=extract-sender
//     Body: { pasted_email: string }
//     Returns: { extracted_email: string | null }
//     Parses the pasted raw email text for the sender's address.
//
//   ?action=create  (default)
//     Body: { counterparty_email, counterparty_name?, pasted_email? }
//     Creates a cro_engagement owned by this CRO user with initiator='cro'.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

// ── Email extractor ───────────────────────────────────────────────────────────
//
// Handles these common raw email formats:
//   Gmail:    "From: Display Name <email@domain.com>"
//   Outlook:  "From: email@domain.com"
//   Exchange: "From: Name [mailto:email@domain.com]"
//   Reply-To: "Reply-To: email@domain.com"
//   Forwarded gmail: "---------- Forwarded message --------- \nFrom: ..."
//   Quoted-printable: encoded names (we just find the email inside)
//
// Returns the first plausible sender email + display name, or nulls if not found.

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function extractSender(raw: string): { email: string | null; name: string | null } {
  if (!raw || !raw.trim()) return { email: null, name: null };

  const lines = raw.split(/\r?\n/);

  // Priority 1: "From:" header line — also parse display name
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^From:\s*/i.test(trimmed)) {
      const emails = trimmed.match(EMAIL_RE);
      if (!emails?.length) continue;
      const email = emails[0].toLowerCase();

      // Try "Display Name <email>" format
      const nameAngle = trimmed.match(/^From:\s*(.+?)\s*<[^>]+>/i);
      if (nameAngle) {
        const name = nameAngle[1].trim().replace(/^["']|["']$/g, '');
        if (name && name.length > 1) return { email, name };
      }
      return { email, name: null };
    }
  }

  // Priority 2: "Reply-To:" header line
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Reply-To:\s*/i.test(trimmed)) {
      const emails = trimmed.match(EMAIL_RE);
      if (emails?.length) return { email: emails[0].toLowerCase(), name: null };
    }
  }

  // Priority 3: first email in the entire text (fallback)
  const allEmails = raw.match(EMAIL_RE);
  if (allEmails?.length) return { email: allEmails[0].toLowerCase(), name: null };

  return { email: null, name: null };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action') ?? 'create';

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // ── Extract sender only ───────────────────────────────────────────────────

  if (action === 'extract-sender') {
    const pasted = (body.pasted_email as string | undefined) ?? '';
    const { email, name } = extractSender(pasted);
    return NextResponse.json({ extracted_email: email, extracted_name: name });
  }

  // ── Create engagement ─────────────────────────────────────────────────────

  const {
    counterparty_email,
    counterparty_name,
    pasted_email,
  } = body as {
    counterparty_email?: string;
    counterparty_name?:  string;
    pasted_email?:       string;
  };

  if (!counterparty_email?.trim()) {
    return NextResponse.json({ error: 'counterparty_email is required' }, { status: 400 });
  }

  // Snapshot the CRO user's capture_mode at engagement creation
  let captureMode: 'assisted' | 'native' = 'assisted';
  try {
    const { data: settings } = await supabase
      .from('cro_user_settings')
      .select('capture_mode')
      .eq('user_id', user.id)
      .maybeSingle();
    if (settings?.capture_mode === 'native' || settings?.capture_mode === 'assisted') {
      captureMode = settings.capture_mode;
    }
  } catch { /* fallback to assisted */ }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const { data: newEng, error: engErr } = await supabase
    .from('cro_engagements')
    .insert({
      user_id:      user.id,
      brief_id:     null,                               // CRO-initiated: no brief
      cro_name:     counterparty_name?.trim() || counterparty_email.trim().split('@')[0],
      cro_email:    counterparty_email.trim().toLowerCase(),
      stage:        'enquiry_sent',                     // CRO already received enquiry
      capture_mode: captureMode,
      initiator:    'cro',
      created_at:   now,
      updated_at:   now,
    })
    .select('id')
    .single();

  if (engErr || !newEng) {
    console.error('[cro/engagements] Insert failed', engErr);
    return NextResponse.json({ error: 'Failed to create engagement' }, { status: 500 });
  }

  // Store pasted email as the first inbound message on this engagement
  if (pasted_email?.trim()) {
    await adminSupabase.from('engagement_messages').insert({
      engagement_id: newEng.id,
      direction:     'inbound',
      message_type:  'enquiry',
      body:          pasted_email.trim(),
      status:        'received',
      ai_generated:  false,
      created_at:    now,
    });
  }

  return NextResponse.json({ engagement_id: newEng.id });
}

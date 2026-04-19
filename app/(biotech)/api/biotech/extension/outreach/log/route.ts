// POST /api/biotech/extension/outreach/log
// Creates or advances cro_engagement records and logs the sent outreach message.
// Called after the user sends the email from Gmail.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brief_id, cros, subject, body: emailBody } = body as {
    brief_id: string;
    cros: { name: string; email: string }[];
    subject: string;
    body: string;
  };

  if (!brief_id || !Array.isArray(cros) || cros.length === 0) {
    return NextResponse.json({ error: 'brief_id and cros[] are required' }, { status: 400 });
  }

  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('id')
    .eq('id', brief_id)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  // Snapshot the user's capture_mode once for all engagements in this batch
  let captureMode: 'assisted' | 'native' = 'assisted';
  try {
    const { data: userSettings } = await supabase
      .from('biotech_user_settings')
      .select('capture_mode')
      .eq('user_id', user.id)
      .maybeSingle();
    if (userSettings?.capture_mode === 'native') captureMode = 'native';
  } catch { /* fallback to assisted */ }

  const now = new Date().toISOString();
  const engagementIds: string[] = [];

  for (const cro of cros) {
    // Find or create engagement
    const { data: existing } = await supabase
      .from('cro_engagements')
      .select('id, stage')
      .eq('brief_id', brief_id)
      .eq('cro_email', cro.email.trim().toLowerCase())
      .maybeSingle();

    let engId: string;

    if (existing) {
      engId = existing.id;
      if (['enquiry_draft', 'enquiry_sent'].includes(existing.stage)) {
        await supabase
          .from('cro_engagements')
          .update({ stage: 'enquiry_sent', updated_at: now })
          .eq('id', engId);
      }
    } else {
      const { data: newEng, error: insErr } = await supabase
        .from('cro_engagements')
        .insert({
          brief_id,
          user_id:      user.id,
          cro_name:     cro.name.trim(),
          cro_email:    cro.email.trim().toLowerCase(),
          stage:        'enquiry_sent',
          capture_mode: captureMode,
          created_at:   now,
          updated_at:   now,
        })
        .select('id')
        .single();

      if (insErr || !newEng) continue;
      engId = newEng.id;
    }

    // Log the sent message
    await supabase.from('engagement_messages').insert({
      engagement_id: engId,
      direction: 'outbound',
      message_type: 'enquiry',
      subject: subject ?? null,
      body: emailBody ?? null,
      status: 'sent',
      sent_at: now,
      ai_generated: true,
      created_at: now,
    });

    engagementIds.push(engId);
  }

  return NextResponse.json({ ok: true, engagement_ids: engagementIds });
}

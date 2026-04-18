// POST /api/biotech/extension/reply/log
// Logs a sent follow-up reply into the engagement thread in the app.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { engagement_id, subject, reply_body, gap_analysis } = body as {
    engagement_id: string;
    subject?: string;
    reply_body: string;
    gap_analysis?: Record<string, unknown>;
  };

  if (!engagement_id || !reply_body) {
    return NextResponse.json({ error: 'engagement_id and reply_body are required' }, { status: 400 });
  }

  const { data: eng } = await supabase
    .from('cro_engagements')
    .select('id, stage')
    .eq('id', engagement_id)
    .eq('user_id', user.id)
    .single();

  if (!eng) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const now = new Date().toISOString();

  // If we have a gap analysis, log the inbound CRO response first
  if (gap_analysis) {
    await supabase.from('engagement_messages').insert({
      engagement_id,
      direction:    'inbound',
      message_type: 'response',
      subject:      subject ? `Re: ${subject}` : null,
      body:         null,
      status:       'received',
      sent_at:      now,
      ai_generated: false,
      ai_metadata:  { gap_analysis },
      created_at:   now,
    });
  }

  // Log the outbound follow-up
  await supabase.from('engagement_messages').insert({
    engagement_id,
    direction:    'outbound',
    message_type: 'followup',
    subject:      subject ?? null,
    body:         reply_body,
    status:       'sent',
    sent_at:      now,
    ai_generated: true,
    created_at:   now,
  });

  // Advance stage
  const nextStage = eng.stage === 'enquiry_sent' ? 'followup_sent'
    : eng.stage === 'response_received'          ? 'followup_sent'
    : 'followup_sent';

  await supabase
    .from('cro_engagements')
    .update({ stage: nextStage, updated_at: now })
    .eq('id', engagement_id);

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, boolean>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { rfp_parsed, deadline_reminders, proposal_complete, win_notification, weekly_summary } = body;

  const { error } = await supabase
    .from('user_email_preferences')
    .upsert(
      {
        user_id: user.id,
        rfp_parsed:         rfp_parsed         ?? true,
        deadline_reminders: deadline_reminders  ?? true,
        proposal_complete:  proposal_complete   ?? true,
        win_notification:   win_notification    ?? true,
        weekly_summary:     weekly_summary      ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

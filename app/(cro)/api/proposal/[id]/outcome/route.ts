import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { sendEmail, userWantsEmail } from '@shared/lib/email';
import { winRecordedTemplate } from '@shared/lib/email-templates';

const VALID_OUTCOMES = ['won', 'lost', 'pending', 'no_decision', 'withdrawn'] as const;
const VALID_LOSS_REASONS = ['price', 'competitor', 'timeline', 'capability', 'no_response', 'scope_mismatch', 'other'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const proposalId = params.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { outcome, outcome_date, outcome_notes, contract_value, loss_reason } = body;

  // Validate outcome
  if (outcome && !VALID_OUTCOMES.includes(outcome as typeof VALID_OUTCOMES[number])) {
    return NextResponse.json({ error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` }, { status: 400 });
  }

  // Validate loss_reason
  if (loss_reason && !VALID_LOSS_REASONS.includes(loss_reason as typeof VALID_LOSS_REASONS[number])) {
    return NextResponse.json({ error: `Invalid loss_reason` }, { status: 400 });
  }

  // Verify proposal belongs to this user via cro_profiles
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('proposals')
    .update({
      outcome: outcome ?? null,
      outcome_date: outcome_date ?? null,
      outcome_notes: outcome_notes ?? null,
      contract_value: contract_value ?? null,
      loss_reason: outcome === 'lost' ? (loss_reason ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send Template 4 — win recorded (fire-and-forget)
  if (outcome === 'won') {
    ;(async () => {
      try {
        const wantsEmail = await userWantsEmail(user.id, 'win_notification');
        if (!wantsEmail) return;
        const { data: rfpData } = await supabase
          .from('rfps')
          .select('biotech_name')
          .eq('id', data.rfp_id)
          .single();
        const { data: profileData } = await supabase
          .from('cro_profiles')
          .select('company_name')
          .eq('id', data.cro_id)
          .single();
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email;
        if (!email) return;
        const { subject, html } = winRecordedTemplate({
          biotechName: rfpData?.biotech_name ?? 'Sponsor',
          proposalId: proposalId,
          croName: profileData?.company_name ?? 'Team',
          contractValue: contract_value as number | null,
        });
        await sendEmail({ to: email, subject, html, templateName: 'win_notification', userId: user.id });
      } catch { /* never surface email errors */ }
    })();
  }

  return NextResponse.json({ proposal: data });
}

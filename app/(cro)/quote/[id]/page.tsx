import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { getPlan } from '@shared/lib/get-plan';
import AppShell from '@shared/components/AppShell';
import QuoteBuilder from '@cro/components/QuoteBuilder';

export default async function QuotePage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const proposalId = params.id;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, rfp_id, status, quote_data, share_token, share_enabled, share_views')
    .eq('id', proposalId)
    .single();

  if (!proposal) notFound();

  // Verify ownership
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) notFound();

  const { data: rfp } = await supabase
    .from('rfps')
    .select('biotech_name, parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  const parsed = (rfp?.parsed_summary ?? {}) as Record<string, unknown>;

  // Fetch existing sections (for Full Proposal toggle)
  const { data: sections } = await supabase
    .from('proposal_sections')
    .select('section_name, content')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });

  // Fetch bid recommendation if cached
  const { data: bidRec } = await supabase
    .from('bid_recommendations')
    .select('decision, summary, confidence_score')
    .eq('rfp_id', proposal.rfp_id)
    .maybeSingle();

  const request = {
    biotech_name:           rfp?.biotech_name ?? null,
    request_type:           (parsed.request_type as string) ?? null,
    study_type:             (parsed.study_type as string) ?? null,
    assay_types:            (parsed.assay_types as string[]) ?? [],
    timeline_weeks:         (parsed.timeline_weeks as number) ?? null,
    submission_deadline:    (parsed.submission_deadline as string) ?? null,
    special_requirements:   (parsed.special_requirements as string[]) ?? [],
  };

  const croContact = {
    company_name: profile.company_name ?? '',
  };

  const plan = await getPlan(profile.id);

  return (
    <AppShell
      title={`Quote — ${rfp?.biotech_name ?? 'Draft'}`}
      backHref="/dashboard"
      backLabel="Proposals"
    >
      <QuoteBuilder
        proposalId={proposalId}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialQuoteData={(proposal.quote_data as any) ?? {
          mode: request.request_type === 'formal_rfp' ? 'full_proposal' : 'quick_quote',
          scope: '',
          timeline: [],
          investment: [],
          next_steps: [],
        }}
        request={request}
        croContact={croContact}
        bidRec={bidRec ?? null}
        existingSections={(sections ?? []).map(s => ({ section_name: s.section_name, content: s.content ?? '' }))}
        shareToken={(proposal as Record<string, unknown>).share_token as string | null ?? null}
        shareEnabled={(proposal as Record<string, unknown>).share_enabled as boolean ?? false}
        shareViews={(proposal as Record<string, unknown>).share_views as number ?? 0}
        plan={plan}
      />
    </AppShell>
  );
}

import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import ProposalEditor from '@cro/components/ProposalEditor';
import ExportButtons from '@cro/components/ExportButtons';
import OutcomePanel from '@cro/components/OutcomePanel';
import SendBidPanel from '@cro/components/SendBidPanel';
import AppShell from '@shared/components/AppShell';
import type { ProposalSection } from '@cro/types';

export default async function ProposalPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const proposalId = params.id;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, status, rfp_id, cro_id, created_at, updated_at, outcome, outcome_date, outcome_notes, contract_value, loss_reason, share_token, share_enabled, share_views, engagement_id')
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

  // Fetch RFP info for the header
  const { data: rfp } = await supabase
    .from('rfps')
    .select('biotech_name, parsed_summary, raw_text')
    .eq('id', proposal.rfp_id)
    .single();

  const { data: sections } = await supabase
    .from('proposal_sections')
    .select('id, section_name, content, is_ai_generated, last_edited_at')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });

  const parsedSummary = rfp?.parsed_summary as { biotech_email?: string | null } | null;
  const biotechEmail = parsedSummary?.biotech_email ?? null;

  return (
    <AppShell
      title={`RFP Bid — ${rfp?.biotech_name ?? 'Draft'}`}
      backHref="/requests"
      backLabel="RFP Bids"
      headerActions={<ExportButtons proposalId={proposalId} />}
      navInLayout
    >
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex gap-8 items-start">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <p className="text-sm text-gray-500">
                {profile.company_name} → {rfp?.biotech_name ?? 'Unknown Sponsor'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Proposal ID: {proposalId}
              </p>
            </div>

            <ProposalEditor
              proposalId={proposalId}
              initialSections={(sections ?? []) as ProposalSection[]}
            />

            <div className="mt-6">
              <OutcomePanel
                proposalId={proposalId}
                initialOutcome={proposal.outcome ?? null}
                initialOutcomeDate={proposal.outcome_date ?? null}
                initialOutcomeNotes={proposal.outcome_notes ?? null}
                initialContractValue={proposal.contract_value ?? null}
                initialLossReason={proposal.loss_reason ?? null}
              />
            </div>
          </div>

          {/* Right sidebar — send + engagement tracking */}
          <div className="w-64 shrink-0 sticky top-6">
            <SendBidPanel
              proposalId={proposalId}
              biotechName={rfp?.biotech_name ?? ''}
              biotechEmail={biotechEmail}
              shareToken={proposal.share_token ?? null}
              shareEnabled={proposal.share_enabled ?? false}
              shareViews={proposal.share_views ?? 0}
              engagementId={proposal.engagement_id ?? null}
              croCompany={profile.company_name ?? ''}
              rawText={(rfp as { raw_text?: string | null } | null)?.raw_text ?? null}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

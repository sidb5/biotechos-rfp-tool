import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import ProposalEditor from '@cro/components/ProposalEditor';
import ExportButtons from '@cro/components/ExportButtons';
import OutcomePanel from '@cro/components/OutcomePanel';
import AppShell from '@shared/components/AppShell';
import type { ProposalSection } from '@cro/types';

export default async function ProposalPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const proposalId = params.id;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, status, rfp_id, cro_id, created_at, updated_at, outcome, outcome_date, outcome_notes, contract_value, loss_reason')
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
    .select('biotech_name, parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  const { data: sections } = await supabase
    .from('proposal_sections')
    .select('id, section_name, content, is_ai_generated, last_edited_at')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });

  return (
    <AppShell
      title={`Proposal — ${rfp?.biotech_name ?? 'Draft'}`}
      backHref="/dashboard"
      backLabel="Proposals"
      headerActions={<ExportButtons proposalId={proposalId} />}
    >
      <div className="max-w-4xl mx-auto px-4 py-10">
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
    </AppShell>
  );
}

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';
import ArchiveButton from '@cro/components/ArchiveButton';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default async function RequestsPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/profile');

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, status, created_at, quote_data, rfps(biotech_name, parsed_summary)')
    .eq('cro_id', profile.id)
    .order('created_at', { ascending: false });

  // Show only formal RFP responses on this page, excluding archived ones
  const rfpResponses = (proposals ?? []).filter(p => {
    if (p.status === 'archived') return false;
    const rfpData = p.rfps as { parsed_summary?: { request_type?: string } } | null;
    const mode = (p.quote_data as { mode?: string } | null)?.mode;
    return rfpData?.parsed_summary?.request_type === 'formal_rfp' || mode === 'full_proposal';
  });

  return (
    <AppShell title="RFP Bids" navInLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {rfpResponses.length === 0 ? (

          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm font-medium text-gray-600 mb-1">No RFP responses yet.</p>
            <p className="text-sm text-gray-400 mb-6">
              When a client sends a formal RFP, create your response here.
            </p>
            <a
              href="/rfp/new?mode=formal_rfp"
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + New RFP Bid →
            </a>
          </div>

        ) : (

          /* ── RFP Responses list ───────────────────────────────────────── */
          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
            {rfpResponses.map(p => {
              const rfpData = p.rfps as {
                biotech_name?: string;
                parsed_summary?: { study_type?: string };
              } | null;
              const statusColors: Record<string, string> = {
                draft:    'bg-amber-50 text-amber-600',
                complete: 'bg-green-50 text-green-700',
              };
              const statusColor = statusColors[p.status ?? ''] ?? 'bg-gray-100 text-gray-500';
              return (
                <li key={p.id} className="flex items-center">
                  <a
                    href={`/rfp/${p.id}`}
                    className="flex flex-1 items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {rfpData?.biotech_name ?? 'Unknown client'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColor}`}>
                          {p.status === 'complete' ? 'Sent' : 'Draft'}
                        </span>
                        {p.created_at ? formatDate(p.created_at) : '—'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400 hover:text-gray-600">
                      View →
                    </span>
                  </a>
                  <div className="pr-4 shrink-0">
                    <ArchiveButton proposalId={p.id} redirectTo="/requests" variant="icon" />
                  </div>
                </li>
              );
            })}
          </ul>

        )}
      </div>
    </AppShell>
  );
}

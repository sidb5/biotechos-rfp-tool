import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';

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
    .select('id, status, created_at, rfps(biotech_name, parsed_summary)')
    .eq('cro_id', profile.id)
    .order('created_at', { ascending: false });

  const allRequests = proposals ?? [];

  return (
    <AppShell title="Requests" navInLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {allRequests.length === 0 ? (

          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm font-medium text-gray-600 mb-1">No requests yet.</p>
            <p className="text-sm text-gray-400 mb-6">
              Paste a client request from your dashboard to get started.
            </p>
            <a
              href="/dashboard"
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Go to dashboard →
            </a>
          </div>

        ) : (

          /* ── Requests list ────────────────────────────────────────────── */
          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
            {allRequests.map(p => {
              const rfpData = p.rfps as {
                biotech_name?: string;
                parsed_summary?: { study_type?: string; request_type?: string };
              } | null;
              const requestTypeLabel =
                rfpData?.parsed_summary?.request_type === 'formal_rfp'
                  ? 'Formal RFP'
                  : 'Quick quote';
              return (
                <li key={p.id}>
                  <a
                    href={`/quote/${p.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {rfpData?.biotech_name ?? 'Unknown client'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px] font-medium">
                          {requestTypeLabel}
                        </span>
                        {p.created_at ? formatDate(p.created_at) : '—'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400 hover:text-gray-600">
                      View →
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

        )}
      </div>
    </AppShell>
  );
}

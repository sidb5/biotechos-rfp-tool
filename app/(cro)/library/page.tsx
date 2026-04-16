import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { getPlan } from '@shared/lib/get-plan';
import { canAccess } from '@shared/lib/feature-flags';
import FeatureGate from '@shared/components/FeatureGate';
import LibraryList from '@cro/components/LibraryList';
import AppShell from '@shared/components/AppShell';

const SECTION_LABELS: Record<string, string> = {
  executive_summary:      'Executive Summary',
  technical_approach:     'Technical Approach',
  team_qualifications:    'Team Qualifications',
  facility_overview:      'Facility Overview',
  proposed_timeline:      'Proposed Timeline',
  assumptions_exclusions: 'Assumptions & Exclusions',
};

export default async function LibraryPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/profile');

  const plan = await getPlan(profile.id);
  const libraryAllowed = canAccess('content_library', plan) as boolean;

  if (!libraryAllowed) {
    return (
      <AppShell title="Library" navInLayout>
        <div className="max-w-4xl mx-auto px-4 py-10">
          <FeatureGate feature="content_library" plan={plan} featureLabel="Content library" overlay>
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-24 text-center">
              <p className="text-gray-300 text-sm font-medium mb-2">Your saved sections appear here.</p>
              <p className="text-gray-300 text-xs">Content library unlocked on Starter and above.</p>
            </div>
          </FeatureGate>
        </div>
      </AppShell>
    );
  }

  const { data: entries } = await supabase
    .from('content_library')
    .select('id, section_name, study_type, assay_types, content, usage_count, last_used_at, created_at, updated_at')
    .eq('cro_id', profile.id)
    .order('updated_at', { ascending: false });

  return (
    <AppShell title="Library" navInLayout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-6">
          <p className="text-sm text-gray-500">
            Saved section content reused across proposals. Each entry is matched by assay type when you generate a new proposal.
          </p>
        </div>

        <LibraryList entries={(entries ?? []).map(e => ({
          ...e,
          section_label: SECTION_LABELS[e.section_name] ?? e.section_name,
        }))} />
      </div>
    </AppShell>
  );
}

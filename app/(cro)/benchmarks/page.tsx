import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { getPlan } from '@shared/lib/get-plan';
import { canAccess } from '@shared/lib/feature-flags';
import FeatureGate from '@shared/components/FeatureGate';
import BenchmarksClient from '@cro/components/BenchmarksClient';
import AppShell from '@shared/components/AppShell';

interface Props {
  searchParams: { assay?: string };
}

export default async function BenchmarksPage({ searchParams }: Props) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get CRO profile
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/profile');

  const plan = await getPlan(profile.id);
  const benchmarksAllowed = canAccess('pricing_benchmarks', plan) as boolean;

  if (!benchmarksAllowed) {
    return (
      <AppShell title="Benchmarks" navInLayout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <FeatureGate feature="pricing_benchmarks" plan={plan} featureLabel="Pricing benchmarks" overlay>
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-24 text-center">
              <p className="text-gray-300 text-sm font-medium">Pricing benchmarks unlocked on Starter and above.</p>
            </div>
          </FeatureGate>
        </div>
      </AppShell>
    );
  }

  // Fetch all benchmark assay types (for the dropdown)
  const { data: allBenchmarks } = await supabase
    .from('pricing_benchmarks')
    .select('assay_type, min_price, median_price, max_price, sample_count')
    .order('assay_type', { ascending: true });

  const allAssayTypes = (allBenchmarks ?? []).map(b => b.assay_type);

  // Default to first assay type if none selected
  const selectedAssay = searchParams.assay ?? allAssayTypes[0] ?? '';

  // Find the benchmark for the selected assay
  const benchmark = (allBenchmarks ?? []).find(b => b.assay_type === selectedAssay) ?? null;

  // Fetch CRO's own pricing for this assay type
  const { data: myPricingRow } = await supabase
    .from('cro_assay_pricing')
    .select('price_per_sample, price_notes')
    .eq('cro_id', profile.id)
    .eq('assay_type', selectedAssay)
    .maybeSingle();

  const myPrice = (myPricingRow?.price_per_sample as number | null) ?? null;
  const myNotes = myPricingRow?.price_notes ?? null;

  return (
    <AppShell title="Benchmarks" navInLayout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        {allAssayTypes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-gray-400 text-sm">No benchmark data available yet.</p>
          </div>
        ) : (
          <BenchmarksClient
            allAssayTypes={allAssayTypes}
            selectedAssay={selectedAssay}
            benchmark={benchmark}
            myPrice={myPrice}
            myNotes={myNotes}
          />
        )}
      </div>
    </AppShell>
  );
}

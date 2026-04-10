import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

// POST /api/benchmarks/my-pricing
// Save (upsert) CRO's price for an assay type
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { assay_type?: string; price_per_sample?: number | null; price_notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { assay_type, price_per_sample, price_notes } = body;
  if (!assay_type) return NextResponse.json({ error: 'assay_type is required' }, { status: 400 });

  // Get CRO profile
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('cro_assay_pricing')
    .upsert(
      {
        cro_id: profile.id,
        assay_type,
        price_per_sample: price_per_sample ?? null,
        price_notes: price_notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cro_id,assay_type' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pricing: data });
}

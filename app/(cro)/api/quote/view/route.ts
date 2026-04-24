// POST /api/quote/view
// Validates access code and returns quote data for public viewing.
// Body: { token: string, password: string }
// Password = last 6 chars of share_token (included in the email).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { token, password } = body;
  if (!token || !password) {
    return NextResponse.json({ error: 'token and password required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, share_token, share_enabled, share_views, share_first_viewed_at, created_at, quote_data, cro_id, rfp_id, gap_citations')
    .eq('share_token', token)
    .single();

  if (!proposal || !proposal.share_enabled) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Validate password: last 6 chars of share_token
  const expectedPassword = proposal.share_token.slice(-6);
  if (password.toLowerCase() !== expectedPassword.toLowerCase()) {
    return NextResponse.json({ error: 'Incorrect access code' }, { status: 403 });
  }

  // Track view
  const now = new Date().toISOString();
  supabase.from('proposals').update({
    share_views: (proposal.share_views ?? 0) + 1,
    share_first_viewed_at: proposal.share_first_viewed_at ?? now,
    share_last_viewed_at: now,
  }).eq('id', proposal.id).then(() => {});

  const quoteData = proposal.quote_data as { mode?: string } | null;
  const isFullProposal = quoteData?.mode === 'full_proposal';

  // Fetch CRO + biotech names; also fetch sections for full proposals
  const [{ data: rfp }, { data: profile }, { data: sections }] = await Promise.all([
    supabase.from('rfps').select('biotech_name').eq('id', proposal.rfp_id).single(),
    supabase.from('cro_profiles').select('company_name').eq('id', proposal.cro_id).single(),
    isFullProposal
      ? supabase
          .from('proposal_sections')
          .select('section_name, content')
          .eq('proposal_id', proposal.id)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    quote_data: proposal.quote_data ?? { mode: 'quick_quote', scope: '', timeline: [], investment: [], next_steps: [] },
    proposal_sections: sections ?? [],
    cro_company: profile?.company_name ?? 'CRO',
    biotech_name: rfp?.biotech_name ?? 'your project',
    created_at: proposal.created_at,
    gap_citations: (proposal.gap_citations as unknown[]) ?? [],
  });
}

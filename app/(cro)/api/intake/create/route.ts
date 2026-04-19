import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { getPlan, getUsage, incrementUsage } from '@shared/lib/get-plan';
import { canAccess } from '@shared/lib/feature-flags';
import { anthropic } from '@shared/lib/claude';
import { SYSTEM_PROMPT } from '@cro/prompts/index';

// ─── Create RFP + draft proposal from analyzed intake ────────────────────────
// Called once the user has confirmed they want to proceed.
// Pre-fills quote_data.investment from saved CRO rates where available.

function calcTotal(qty: string, unitPrice: string): string {
  const q = parseFloat(qty.replace(/,/g, ''));
  const u = parseFloat(unitPrice.replace(/[$,]/g, ''));
  if (!isNaN(q) && !isNaN(u) && q > 0 && u > 0) {
    return `$${(q * u).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return '';
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    cro_profile_id: string;
    raw_text: string;
    parsed_summary: Record<string, unknown>;
    biotech_name?: string | null;
  };

  try {
    body = await request.json();
    if (!body.cro_profile_id || !body.raw_text) throw new Error('missing fields');
  } catch {
    return NextResponse.json({ error: 'cro_profile_id and raw_text are required' }, { status: 400 });
  }

  // Verify CRO profile ownership
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, assay_types, therapeutic_areas, facility_description')
    .eq('id', body.cro_profile_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'CRO profile not found' }, { status: 403 });
  }

  // ── Usage / plan check ────────────────────────────────────────────────────
  const plan = await getPlan(body.cro_profile_id);
  const limit = canAccess('proposals_per_month', plan) as number;
  if (limit !== Infinity) {
    const usage = await getUsage(body.cro_profile_id);
    if (usage.proposals_created >= limit) {
      return NextResponse.json({
        error: 'limit_reached',
        message: `You've used all ${limit} proposals for this month on the ${plan} plan.`,
        upgrade_url: '/pricing',
      }, { status: 402 });
    }
  }

  // Fetch saved rates for this CRO
  const { data: savedRates } = await supabase
    .from('cro_assay_pricing')
    .select('assay_type, price_per_sample')
    .eq('cro_id', body.cro_profile_id);

  const hasSavedRates = (savedRates ?? []).some(r => r.price_per_sample != null);

  // Build investment rows from parsed assay types + saved rates
  const assayTypes: string[] = (body.parsed_summary?.assay_types as string[]) ?? [];
  const sampleCount = body.parsed_summary?.sample_count as string | null ?? '';

  const investmentRows = assayTypes.map(assay => {
    const rate = (savedRates ?? []).find(
      r => r.assay_type.toLowerCase() === assay.toLowerCase()
    );
    const unitPrice = rate?.price_per_sample ? `$${Number(rate.price_per_sample).toLocaleString('en-US')}` : '';
    const qty = sampleCount;
    const total = unitPrice && qty ? calcTotal(qty, unitPrice) : '';
    return {
      item: assay,
      qty,
      unit_price: unitPrice,
      total,
      _savedRate: !!rate?.price_per_sample,
    };
  });

  // Ensure at least one row
  if (investmentRows.length === 0) {
    investmentRows.push({ item: '', qty: '', unit_price: '', total: '', _savedRate: false });
  }

  const requestType = body.parsed_summary?.request_type as string | undefined;
  const parsed = body.parsed_summary ?? {};

  // Generate scope server-side so it is ready when the quote page opens.
  // Fire this now while we still have all context; fall back to '' on error.
  let scopeText = '';
  try {
    const scopePrompt = `Write a concise 3-5 sentence scope description for a quick quote from a preclinical CRO to a biotech client.

Sponsor: ${(parsed.biotech_name as string) ?? 'the client'}
Study type: ${(parsed.study_type as string) ?? 'preclinical study'}
Assay types: ${Array.isArray(parsed.assay_types) ? (parsed.assay_types as string[]).join(', ') : 'as discussed'}
Species: ${(parsed.species as string) ?? 'to be confirmed'}
Key endpoints: ${Array.isArray(parsed.primary_endpoints) ? (parsed.primary_endpoints as string[]).slice(0, 3).join(', ') : 'as specified'}
Timeline: ${parsed.timeline_weeks ? `${parsed.timeline_weeks} weeks` : 'to be confirmed'}
Special requirements: ${Array.isArray(parsed.special_requirements) ? (parsed.special_requirements as string[]).join(', ') : 'none noted'}

CRO: ${profile.company_name ?? 'our team'}
CRO capabilities: ${Array.isArray(profile.assay_types) ? (profile.assay_types as string[]).join(', ') : 'preclinical services'}

Write in first person ("We will..."). Be specific to the study requested. No generic filler. No headings. Return only the scope paragraph text.`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: scopePrompt }],
    });
    const block = msg.content[0];
    if (block.type === 'text') scopeText = block.text.trim();
  } catch { /* non-fatal — client-side regeneration still available */ }

  const quoteData = {
    mode: requestType === 'formal_rfp' ? 'full_proposal' : 'quick_quote',
    scope: scopeText,
    timeline: [
      { label: 'Study start',    description: '', date: '' },
      { label: 'Key milestone',  description: '', date: '' },
      { label: 'Report delivery', description: '', date: '' },
    ],
    investment: investmentRows,
    next_steps: [],
    _hasSavedRates: hasSavedRates,
  };

  // Create the RFP record
  const { data: rfpRow, error: rfpError } = await supabase
    .from('rfps')
    .insert({
      cro_id: body.cro_profile_id,
      raw_text: body.raw_text,
      parsed_summary: body.parsed_summary,
      biotech_name: body.biotech_name ?? null,
      status: 'parsed',
    })
    .select('id')
    .single();

  if (rfpError || !rfpRow) {
    console.error('[intake/create] rfp insert error:', rfpError);
    return NextResponse.json({ error: rfpError?.message ?? 'Failed to save request' }, { status: 500 });
  }

  // Create a draft proposal with pre-filled quote_data
  const { data: proposalRow, error: proposalError } = await supabase
    .from('proposals')
    .insert({
      rfp_id: rfpRow.id,
      cro_id: body.cro_profile_id,
      status: 'draft',
      quote_data: quoteData,
    })
    .select('id')
    .single();

  if (proposalError || !proposalRow) {
    console.error('[intake/create] proposal insert error:', proposalError);
    return NextResponse.json({ error: proposalError?.message ?? 'Failed to create proposal' }, { status: 500 });
  }

  // Increment usage counter (fire-and-forget — don't block response)
  incrementUsage(body.cro_profile_id, 'proposals_created').catch(console.error);

  return NextResponse.json({
    rfp_id: rfpRow.id,
    proposal_id: proposalRow.id,
    has_saved_rates: hasSavedRates,
    prefilled_count: investmentRows.filter(r => r._savedRate).length,
  });
}

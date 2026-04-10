import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { anthropic } from '@shared/lib/claude';

const BID_RECOMMEND_SYSTEM = `You are an expert preclinical CRO business development advisor with 20 years of experience.
Analyse RFPs against CRO capabilities and give honest, direct bid/no-bid recommendations.
Never be vague. Always give a clear recommendation with specific reasoning.
Return ONLY valid JSON — no markdown, no prose outside the JSON object.`;

interface BidRecommendationResult {
  recommendation: 'bid' | 'no_bid' | 'bid_with_caution';
  confidence_score: number;
  fit_scores: {
    capability_fit: number;
    timeline_fit: number;
    therapeutic_fit: number;
    accreditation_fit: number;
  };
  reasoning: {
    strengths: string[];
    concerns: string[];
    missing_info: string[];
    recommendation_summary: string;
  };
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rfpId = params.id;

  // Fetch RFP and verify ownership
  const { data: rfp } = await supabase
    .from('rfps')
    .select('id, cro_id, parsed_summary')
    .eq('id', rfpId)
    .single();

  if (!rfp) return NextResponse.json({ error: 'RFP not found' }, { status: 404 });

  // Verify ownership via cro_profiles
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, assay_types, therapeutic_areas, accreditations, geographic_reach')
    .eq('id', rfp.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Check if recommendation already exists — return cached result
  const { data: existing } = await supabase
    .from('bid_recommendations')
    .select('*')
    .eq('rfp_id', rfpId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ recommendation: existing });
  }

  // Build prompt from RFP + profile data
  const parsed = rfp.parsed_summary as {
    study_type?: string;
    assay_types?: string[];
    timeline_weeks?: string;
    special_requirements?: string[];
    ambiguities?: string[];
    therapeutic_areas?: string[];
  } | null;

  const prompt = `Analyse this RFP and CRO profile to determine if the CRO should respond to this proposal.

CRO Profile:
Company: ${profile.company_name}
Assay capabilities: ${(profile.assay_types ?? []).join(', ') || 'Not specified'}
Therapeutic areas: ${(profile.therapeutic_areas ?? []).join(', ') || 'Not specified'}
Accreditations: ${(profile.accreditations ?? []).join(', ') || 'Not specified'}
Geographic reach: ${profile.geographic_reach ?? 'Not specified'}

RFP Requirements:
Study type: ${parsed?.study_type ?? 'Not specified'}
Assays requested: ${(parsed?.assay_types ?? []).join(', ') || 'Not specified'}
Timeline: ${parsed?.timeline_weeks ?? 'Not specified'} weeks
Special requirements: ${(parsed?.special_requirements ?? []).join('; ') || 'None'}
Ambiguities: ${(parsed?.ambiguities ?? []).join('; ') || 'None'}

Return ONLY this JSON object (no other text):
{
  "recommendation": "bid" | "no_bid" | "bid_with_caution",
  "confidence_score": 0-100,
  "fit_scores": {
    "capability_fit": 0-100,
    "timeline_fit": 0-100,
    "therapeutic_fit": 0-100,
    "accreditation_fit": 0-100
  },
  "reasoning": {
    "strengths": ["specific strength 1", "specific strength 2"],
    "concerns": ["specific concern 1"],
    "missing_info": ["clarification needed 1"],
    "recommendation_summary": "2-3 sentence plain English explanation"
  }
}`;

  let result: BidRecommendationResult;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: BID_RECOMMEND_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');

    const rawJson = block.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    result = JSON.parse(rawJson) as BidRecommendationResult;

    // Validate required fields
    if (!['bid', 'no_bid', 'bid_with_caution'].includes(result.recommendation)) {
      throw new Error('Invalid recommendation value in response');
    }
  } catch (err) {
    console.error('[recommend] API error:', err);
    Sentry.captureException(err, {
      tags: { component: 'claude_api', operation: 'bid_recommend' },
      extra: { rfpId },
    });
    // Return graceful degradation — never block the user
    return NextResponse.json({ recommendation: null, error: 'Analysis unavailable' });
  }

  // Upsert to DB
  const { data: saved, error: dbErr } = await supabase
    .from('bid_recommendations')
    .upsert(
      {
        rfp_id: rfpId,
        recommendation: result.recommendation,
        confidence_score: result.confidence_score,
        fit_scores: result.fit_scores,
        reasoning: result.reasoning,
      },
      { onConflict: 'rfp_id' }
    )
    .select()
    .single();

  if (dbErr) {
    console.error('[recommend] DB error:', dbErr);
    // Still return the result even if DB save fails
    return NextResponse.json({ recommendation: result });
  }

  return NextResponse.json({ recommendation: saved });
}

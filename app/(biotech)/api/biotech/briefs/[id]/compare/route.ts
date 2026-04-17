// POST /api/biotech/briefs/[id]/compare
// Accepts engagement summaries, returns AI-ranked comparison.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';

export interface BidInput {
  engagement_id: string;
  cro_name: string;
  stage: string;
  quoted_amount?: number | null;
  quoted_currency?: string | null;
  quoted_timeline?: string | null;
  quote_notes?: string | null;
  key_strengths?: string | null;
  concerns?: string | null;
}

export interface RankedBid {
  engagement_id: string;
  rank: number;
  score: number;        // 1-100
  headline: string;    // one punchy sentence
  strengths: string[];
  risks: string[];
  recommendation: string;
}

export interface CompareResult {
  summary: string;
  ranked: RankedBid[];
  suggested_winner_id: string | null;
  suggested_winner_rationale: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify brief belongs to this user
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('id, title, classification')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  let body: { bids: BidInput[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { bids } = body;
  if (!Array.isArray(bids) || bids.length < 2) {
    return NextResponse.json({ error: 'At least 2 bids required' }, { status: 400 });
  }

  const bidDescriptions = bids.map((b, i) => {
    const lines = [`Bid ${i + 1}: ${b.cro_name}`];
    if (b.quoted_amount) {
      lines.push(`  Price: ${b.quoted_currency ?? 'USD'} ${b.quoted_amount.toLocaleString()}`);
    } else {
      lines.push(`  Price: not quoted (RFP stage — ${b.stage})`);
    }
    if (b.quoted_timeline) lines.push(`  Timeline: ${b.quoted_timeline}`);
    if (b.quote_notes)    lines.push(`  Notes: ${b.quote_notes}`);
    if (b.key_strengths)  lines.push(`  Strengths: ${b.key_strengths}`);
    if (b.concerns)       lines.push(`  Concerns/open questions: ${b.concerns}`);
    return lines.join('\n');
  }).join('\n\n');

  const prompt = `You are evaluating CRO bids for a preclinical study brief titled "${brief.title}"${brief.classification ? ` (${brief.classification})` : ''}.

Here are the bids to compare:

${bidDescriptions}

Rank these bids from best to worst fit for the sponsor. Consider: price-value ratio, timeline, risk flags, scientific fit.
Do NOT factor in or mention compound names, mechanisms, or disease indications.

Return a JSON object with this exact structure (no markdown, no prose outside JSON):
{
  "summary": "<2-3 sentence executive comparison>",
  "ranked": [
    {
      "engagement_id": "<from input>",
      "rank": 1,
      "score": <1-100>,
      "headline": "<one sentence — punchy competitive assessment>",
      "strengths": ["<strength 1>", "<strength 2>"],
      "risks": ["<risk 1>"],
      "recommendation": "<1-2 sentences on when to pick this CRO>"
    }
  ],
  "suggested_winner_id": "<engagement_id of top pick, or null if too close to call>",
  "suggested_winner_rationale": "<1-2 sentences explaining the pick>"
}`;

  try {
    const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 1500 });
    // Strip markdown fences Claude sometimes adds despite instructions
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const result: CompareResult = JSON.parse(cleaned);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI ranking failed';
    console.error('[compare] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

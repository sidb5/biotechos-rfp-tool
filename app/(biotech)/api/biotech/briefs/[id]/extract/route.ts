import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';
import {
  buildExtractionPrompt,
  FIELD_KEYS,
  type ExtractedData,
  type FieldKey,
} from '@biotech/prompts/extract-brief';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // ── Fetch brief (RLS ensures ownership) ───────────────────────────────────
  const { data: brief, error: fetchError } = await supabase
    .from('rfp_internal_briefs')
    .select('id, raw_inputs')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !brief) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  // ── Build combined input text ──────────────────────────────────────────────
  const raw = brief.raw_inputs as {
    text?: string;
    docs?: { filename: string; text: string }[];
    voice_transcript?: string;
  } | null;

  const parts: string[] = [];
  if (raw?.text?.trim())             parts.push(raw.text.trim());
  if (raw?.voice_transcript?.trim()) parts.push(`[Voice transcript]\n${raw.voice_transcript.trim()}`);
  if (raw?.docs?.length) {
    for (const doc of raw.docs) {
      if (doc.text?.trim()) {
        parts.push(`[From document: ${doc.filename}]\n${doc.text.trim()}`);
      }
    }
  }

  if (parts.length === 0) {
    return NextResponse.json(
      { error: 'Brief has no content to extract from.' },
      { status: 422 }
    );
  }

  const combinedInput = parts.join('\n\n');

  // ── Call Claude ───────────────────────────────────────────────────────────
  let rawResponse: string;
  try {
    rawResponse = await biotechClaude({
      userPrompt: buildExtractionPrompt(combinedInput),
      maxTokens: 3000,
    });
  } catch (err) {
    console.error('[extract] Claude error:', err);
    return NextResponse.json(
      { error: 'AI extraction failed. Please try again.' },
      { status: 502 }
    );
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let parsed: ExtractedData;
  try {
    // Strip any accidental markdown fences Claude might add
    const cleaned = rawResponse
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[extract] JSON parse failed. Raw response:', rawResponse.slice(0, 500));
    return NextResponse.json(
      { error: 'AI returned malformed JSON. Please try again.' },
      { status: 502 }
    );
  }

  // ── Validate shape ────────────────────────────────────────────────────────
  const VALID_TAGS = new Set(['STATED', 'INFERRED', 'MISSING']);
  for (const key of FIELD_KEYS) {
    const field = parsed[key as FieldKey];
    if (!field || typeof field !== 'object') {
      parsed[key as FieldKey] = { value: null, tag: 'MISSING' };
      continue;
    }
    if (!VALID_TAGS.has(field.tag)) field.tag = 'MISSING';
    if (field.value !== null && typeof field.value !== 'string') {
      field.value = String(field.value);
    }
  }

  if (!parsed.classification || typeof parsed.classification !== 'string') {
    parsed.classification = 'other';
  }

  return NextResponse.json({ extracted: parsed });
}

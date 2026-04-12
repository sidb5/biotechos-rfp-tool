// POST /api/biotech/briefs/[id]/rfp/generate
// Generates all 10 RFP sections via sequential Claude calls.
// Upserts into rfp_documents (one per brief).
// Streams progress back as newline-delimited JSON so the UI can show
// section-by-section progress without waiting for all 10.
//
// If an rfp_documents record already exists for this brief, it is overwritten
// only for sections the caller requests (default: all 10 = full regeneration).

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import {
  SECTION_KEYS,
  SECTION_META,
  buildSectionPrompt,
  type SectionKey,
  type RfpContext,
} from '@biotech/prompts/rfp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Completeness scoring (rule-based, 0-100) ─────────────────────────────────
function scoreCompleteness(sections: Partial<Record<SectionKey, string>>): number {
  let filled = 0;
  let toBeFilled = 0;

  for (const key of SECTION_KEYS) {
    const text = sections[key] ?? '';
    if (text.length > 50) {
      filled++;
      if (text.includes('[TO BE SPECIFIED]')) toBeFilled++;
    }
  }

  const sectionScore = (filled / SECTION_KEYS.length) * 70;
  const gapPenalty   = Math.min(toBeFilled * 5, 30);
  return Math.round(Math.max(0, sectionScore + 30 - gapPenalty));
}

// ── Human-readable RFP ID ─────────────────────────────────────────────────────
function generateRfpId(): string {
  const year  = new Date().getFullYear();
  const rand  = Math.floor(Math.random() * 900) + 100;
  return `RFP-${year}-${rand}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  // Parse optional body — caller can pass sections[] to only regenerate specific ones
  let sectionsToGenerate: SectionKey[] = [...SECTION_KEYS];
  try {
    const body = await req.json() as { sections?: string[] };
    if (Array.isArray(body.sections) && body.sections.length > 0) {
      sectionsToGenerate = body.sections.filter(s =>
        (SECTION_KEYS as readonly string[]).includes(s)
      ) as SectionKey[];
    }
  } catch { /* no body — generate all */ }

  // ── Load brief ───────────────────────────────────────────────────────────────
  // Select core fields only — rfp_context_notes is loaded separately below
  // so a missing column (migration not yet applied) doesn't block generation.
  const { data: brief, error: briefError } = await supabase
    .from('rfp_internal_briefs')
    .select('id, title, extracted_data')
    .eq('id', briefId)
    .eq('user_id', user.id)
    .single();

  if (!brief) {
    console.error('[rfp/generate] brief fetch failed:', briefError?.message);
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  // Load rfp_context_notes separately — falls back to [] if column doesn't
  // exist yet (migration 20260410000005 pending).
  let rfpContextNotes: { text: string; type: string; source_cro_name: string }[] = [];
  try {
    const { data: notesRow } = await supabase
      .from('rfp_internal_briefs')
      .select('rfp_context_notes')
      .eq('id', briefId)
      .single();
    if (Array.isArray(notesRow?.rfp_context_notes)) {
      rfpContextNotes = notesRow.rfp_context_notes as typeof rfpContextNotes;
    }
  } catch { /* column not yet migrated — proceed without notes */ }

  // ── Load user settings ───────────────────────────────────────────────────────
  const { data: settings } = await supabase
    .from('biotech_user_settings')
    .select('company_name, sender_display_name, sender_email')
    .eq('user_id', user.id)
    .maybeSingle();

  // ── Load engagement thread summaries (last 3 msgs per engagement) ─────────────
  const { data: engagements } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, engagement_messages(direction, body, created_at)')
    .eq('brief_id', briefId)
    .eq('user_id', user.id)
    .neq('stage', 'enquiry_draft');

  const threadSummaries = (engagements ?? []).map(eng => {
    const msgs = ((eng.engagement_messages ?? []) as { direction: string; body: string | null; created_at: string }[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-3)
      .map(m => `${m.direction === 'outbound' ? 'Biotech' : eng.cro_name}: ${(m.body ?? '').slice(0, 200)}`)
      .join('\n');
    return { cro_name: eng.cro_name, summary: msgs };
  });

  // ── Load or create rfp_documents record ──────────────────────────────────────
  const { data: existing } = await supabase
    .from('rfp_documents')
    .select('*')
    .eq('brief_id', briefId)
    .maybeSingle();

  const rfpId    = (existing as { rfp_id?: string } | null)?.rfp_id ?? generateRfpId();
  const issueDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const ctx: RfpContext = {
    rfpId,
    companyName:     settings?.company_name     ?? '[Company Name]',
    contactName:     settings?.sender_display_name ?? '[Contact Name]',
    contactEmail:    settings?.sender_email      ?? '[Contact Email]',
    issueDate,
    extractedData:   (brief.extracted_data ?? {}) as Record<string, { value: string | null; tag: string }>,
    rfpContextNotes,
    threadSummaries,
  };

  // ── Generate sections sequentially, streaming progress ───────────────────────
  // We use a TransformStream to send newline-delimited JSON as each section completes.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  const write = (obj: object) =>
    writer.write(encoder.encode(JSON.stringify(obj) + '\n'));

  // Run generation in background — do not await
  (async () => {
    try {
      const sectionValues: Partial<Record<SectionKey, string>> = {};

      // Carry over existing sections that aren't being regenerated
      if (existing) {
        for (const key of SECTION_KEYS) {
          const val = (existing as Record<string, unknown>)[key] as string | null;
          if (val && !sectionsToGenerate.includes(key)) {
            sectionValues[key] = val;
          }
        }
      }

      for (const key of sectionsToGenerate) {
        await write({ type: 'progress', section: key, label: SECTION_META[key].label, status: 'generating' });

        try {
          const prompt = buildSectionPrompt(key, ctx);
          const response = await anthropic.messages.create({
            model:      'claude-sonnet-4-5',
            max_tokens: SECTION_META[key].maxTokens,
            system:     'You are an expert preclinical study RFP writer. Write formally and precisely. Use [TO BE SPECIFIED] for unknown content. Never invent data.',
            messages:   [{ role: 'user', content: prompt }],
          });
          const text = (response.content[0] as { type: string; text: string }).text.trim();
          sectionValues[key] = text;
          await write({ type: 'section', section: key, label: SECTION_META[key].label, text, status: 'done' });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sectionValues[key] = `[Generation failed: ${msg}]`;
          await write({ type: 'section', section: key, label: SECTION_META[key].label, text: sectionValues[key], status: 'error', error: msg });
        }
      }

      // Upsert into rfp_documents
      const score = scoreCompleteness(sectionValues);
      const upsertData = {
        brief_id:          briefId,
        user_id:           user.id,
        rfp_id:            rfpId,
        completeness_score: score,
        updated_at:        new Date().toISOString(),
        ...Object.fromEntries(
          Object.entries(sectionValues).map(([k, v]) => [k, v ?? null])
        ),
      };

      const { error: upsertError } = await supabase
        .from('rfp_documents')
        .upsert(upsertData, { onConflict: 'brief_id' });

      if (upsertError) {
        // Most likely cause: rfp_documents table migration (20260410000006) not yet applied.
        console.error('[rfp/generate] upsert failed:', upsertError.message);
        await write({
          type:  'error',
          error: `Failed to save RFP: ${upsertError.message}. Ensure migration 20260410000006 has been applied.`,
        });
        return;
      }

      await write({ type: 'complete', rfp_id: rfpId, completeness_score: score });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await write({ type: 'error', error: msg });
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(readable, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

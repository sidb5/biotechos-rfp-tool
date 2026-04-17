import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { anthropic } from '@shared/lib/claude';

// ─── QQ4 intake analysis ─────────────────────────────────────────────────────
// Classifies the request and determines routing.
// Does NOT write to the database — that happens in /api/intake/create.

const ANALYZE_SYSTEM =
  'You are analysing incoming client requests to a preclinical CRO. ' +
  'Extract all available information and determine if the CRO can quote immediately. ' +
  'Return ONLY valid JSON. No prose.';

function analyzePrompt(text: string): string {
  return `Analyse this client request and return exactly this JSON structure:
{
  "request_type": "formal_rfp" | "informal_request" | "not_a_request",
  "confidence": 0-100,
  "can_quote_now": true | false,
  "biotech_name": "company name or null",
  "study_type": "type of study or null",
  "assay_types": ["list or empty array"],
  "species": "species or null",
  "primary_endpoints": ["list or empty array"],
  "secondary_endpoints": ["list or empty array"],
  "sample_count": "count or null",
  "timeline_weeks": number_or_null,
  "deliverables": ["list or empty array"],
  "budget_range": "range or null",
  "submission_deadline": "ISO date or null",
  "special_requirements": ["list or empty array"],
  "missing_critical_info": ["plain English question about a blocking gap — only truly critical missing info"],
  "ambiguities": ["unclear items that do not block quoting"]
}

Rules:
- request_type "not_a_request" only if the text has nothing to do with running a study
- can_quote_now is false only if missing_critical_info is non-empty
- missing_critical_info should contain friendly English questions (not field names)
- Keep missing_critical_info short — only ask for what is truly blocking

Request text:
${text}`;
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.eml') || file.type === 'text/plain') {
    return await file.text();
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const buffer = Buffer.from(await file.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const pdfParse = require('pdf-parse/lib/pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error('Unsupported file type. Use PDF, Word, .eml, or .txt.');
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let text = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 }); }

    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    try { text = await extractTextFromFile(file); }
    catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to read file' },
        { status: 400 }
      );
    }
  } else {
    try {
      const body = await request.json();
      text = body.text ?? '';
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  }

  text = text.trim();
  if (!text) return NextResponse.json({ error: 'No text to analyse' }, { status: 400 });

  // Truncate to avoid token overflow
  if (text.length > 40_000) text = text.slice(0, 40_000) + '\n\n[...truncated]';

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: ANALYZE_SYSTEM,
      messages: [{ role: 'user', content: analyzePrompt(text) }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected Claude response type');

    const rawJson = block.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const result = JSON.parse(rawJson);
    // Echo back the extracted text so the client can pass it to /intake/create
    return NextResponse.json({ ...result, _text: text });
  } catch (err) {
    console.error('[intake/analyze] error:', err);
    return NextResponse.json(
      { error: 'Failed to analyse the request. Please try again.' },
      { status: 502 }
    );
  }
}

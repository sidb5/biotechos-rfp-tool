import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const MAX_CHARS = 32000; // ~8000 tokens

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'text/plain': 'txt',
  'text/html': 'html',
};

async function extractText(buffer: Buffer, type: string): Promise<string> {
  if (type === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text ?? '';
  }
  if (type === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }
  // txt / html — just decode
  return buffer.toString('utf-8');
}

export async function POST(request: Request) {
  // Auth check
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll('files') as File[];
  const pastedText = (formData.get('text') as string) ?? '';

  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed.` }, { status: 400 });
  }

  // Extract text from all files
  const textParts: string[] = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;

    const mimeType = file.type.split(';')[0].trim();
    const fileType = ALLOWED_TYPES[mimeType];
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.name}. Use PDF, DOCX, TXT, or HTML.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 10MB limit.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await extractText(buffer, fileType);
    if (text.trim()) {
      textParts.push(`=== ${file.name} ===\n${text}`);
    }
  }

  if (pastedText.trim()) {
    textParts.push(`=== Pasted content ===\n${pastedText}`);
  }

  if (textParts.length === 0) {
    return NextResponse.json({ error: 'No readable content found. Please upload files or paste text.' }, { status: 400 });
  }

  // Concatenate and truncate
  let combined = textParts.join('\n\n');
  if (combined.length > MAX_CHARS) {
    combined = combined.slice(0, MAX_CHARS) + '\n\n[Content truncated]';
  }

  // Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const extractionPrompt = `You are extracting structured information about a preclinical Contract Research Organization (CRO) from their company documents (website copy, capability statements, brochures, etc.).

Extract the following fields from the provided text. Return ONLY valid JSON — no prose, no markdown, no code fences.

JSON schema:
{
  "company_name": "exact company name or null",
  "company_overview": "2-3 sentence summary of what the CRO does, their strengths, and what makes them distinctive — or null if not enough info",
  "therapeutic_areas": ["array of therapeutic areas from: Oncology, CNS, Cardiovascular, Infectious Disease, Rare Disease, Immunology, Other — only include what is clearly mentioned"],
  "assay_types": ["array from: In vitro tox, DMPK/PK, Safety pharmacology, In vivo efficacy, Organoid studies, Bioanalysis, Histopathology, Other — only include what is clearly mentioned"],
  "team_members": [{"name": "string", "title": "string", "years_experience": number or 0, "expertise": "one sentence"}],
  "facility_description": "description of lab facilities, equipment, capacity — or null",
  "accreditations": ["array from: GLP, AAALAC, ISO 17025, CAP, Other — only include explicitly mentioned"],
  "geographic_reach": "locations served or where labs are located — or null"
}

Rules:
- Only extract what is clearly stated. Do not infer or hallucinate.
- For team_members, only include named individuals with titles. Empty array if none found.
- therapeutic_areas and assay_types must only contain values from the allowed lists above.
- Return null for any field where the information is absent or unclear.
- company_overview should be written in third person as if describing the CRO to a potential client.

Source documents:
${combined}`;

  const pricingPrompt = `From the same documents, extract any pricing information for CRO services.

Return ONLY valid JSON — no prose, no markdown:
{
  "pricing_found": true or false,
  "prices": [
    {
      "assay_type": "name of the assay or service",
      "price_per_sample": number or null,
      "price_notes": "e.g. 'per sample', 'per study', 'starting from', currency if not USD"
    }
  ]
}

If no pricing is found, return: {"pricing_found": false, "prices": []}

Source documents:
${combined}`;

  try {
    const [profileResponse, pricingResponse] = await Promise.all([
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: 'You are a data extraction assistant. You return only valid JSON, exactly matching the requested schema. Never include explanations, markdown, or code fences.',
        messages: [{ role: 'user', content: extractionPrompt }],
      }),
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are a data extraction assistant. You return only valid JSON, exactly matching the requested schema. Never include explanations, markdown, or code fences.',
        messages: [{ role: 'user', content: pricingPrompt }],
      }),
    ]);

    const profileBlock = profileResponse.content[0];
    const pricingBlock = pricingResponse.content[0];

    if (profileBlock.type !== 'text' || pricingBlock.type !== 'text') {
      throw new Error('Unexpected response from AI');
    }

    let profile: Record<string, unknown>;
    let pricing: Record<string, unknown>;

    try {
      // Strip any accidental markdown fences
      const cleanProfile = profileBlock.text.replace(/```(?:json)?\n?/g, '').trim();
      const cleanPricing = pricingBlock.text.replace(/```(?:json)?\n?/g, '').trim();
      profile = JSON.parse(cleanProfile);
      pricing = JSON.parse(cleanPricing);
    } catch {
      throw new Error('AI returned invalid JSON. Please try again.');
    }

    return NextResponse.json({ profile, pricing });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

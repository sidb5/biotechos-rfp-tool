import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { anthropic } from '@shared/lib/claude';
import { SYSTEM_PROMPT } from '@cro/prompts/index';
import { rfpParsePrompt } from '@cro/prompts/rfp-parse';
import { sendEmail, userWantsEmail } from '@shared/lib/email';
import { rfpParsedTemplate } from '@shared/lib/email-templates';
import type { ParsedRFP } from '@cro/types';

// Max RFP text length to send to Claude (characters)
const MAX_TEXT_LENGTH = 40_000;

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Use pdf-parse/lib/pdf-parse.js directly to skip the index.js debug code
  // that tries to read ./test/data/05-versions-space.pdf (fails in Next.js bundled env)
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const pdfParse = require('pdf-parse/lib/pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rfpText = '';
  let croProfileId = '';

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    // File upload path
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.error('[rfp/parse] formData parse error:', err);
      return NextResponse.json({ error: 'Failed to parse uploaded file. Try again.' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    croProfileId = (formData.get('cro_profile_id') as string) ?? '';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
        rfpText = await extractTextFromPDF(buffer);
      } else if (
        fileName.endsWith('.docx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        rfpText = await extractTextFromDocx(buffer);
      } else {
        return NextResponse.json(
          { error: 'Unsupported file type. Upload a .pdf or .docx file.' },
          { status: 400 }
        );
      }
    } catch (err) {
      console.error('[rfp/parse] text extraction error:', err);
      Sentry.captureException(err, {
        tags: { component: 'file_parse' },
        extra: { fileName: file?.name, fileType: file?.type },
      });
      return NextResponse.json(
        { error: `Failed to extract text from file: ${err instanceof Error ? err.message : 'unknown error'}` },
        { status: 400 }
      );
    }
  } else {
    // Pasted text path
    try {
      const body = await request.json();
      rfpText = body.text ?? '';
      croProfileId = body.cro_profile_id ?? '';
    } catch (err) {
      console.error('[rfp/parse] JSON body parse error:', err);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  }

  rfpText = rfpText.trim();
  if (!rfpText) {
    return NextResponse.json(
      { error: 'No RFP text could be extracted. The file may be empty or image-only (scanned PDF).' },
      { status: 400 }
    );
  }

  const wordCount = rfpText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 50) {
    return NextResponse.json(
      { error: `RFP text is too short (${wordCount} words). Paste the full document — minimum 50 words required.` },
      { status: 400 }
    );
  }

  // Truncate if too long — keep within Claude's useful context
  if (rfpText.length > MAX_TEXT_LENGTH) {
    rfpText = rfpText.slice(0, MAX_TEXT_LENGTH) + '\n\n[...truncated]';
  }

  // Verify the CRO profile belongs to this user
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', croProfileId)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: 'CRO profile not found or does not belong to this user' },
      { status: 403 }
    );
  }

  // Call Claude to parse the RFP
  let parsedRFP: ParsedRFP;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: rfpParsePrompt(rfpText),
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Strip any accidental markdown fences
    const rawJson = block.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    parsedRFP = JSON.parse(rawJson) as ParsedRFP;
  } catch (err) {
    console.error('Claude parse error:', err);
    Sentry.captureException(err, {
      tags: { component: 'claude_api', operation: 'rfp_parse' },
      extra: { rfpTextLength: rfpText.length },
    });
    return NextResponse.json(
      { error: 'Failed to parse the RFP. The document may be too complex or ambiguous.' },
      { status: 502 }
    );
  }

  // Save the raw RFP + parsed summary to the DB
  const { data: rfpRow, error: dbError } = await supabase
    .from('rfps')
    .insert({
      cro_id: croProfileId,
      raw_text: rfpText,
      parsed_summary: parsedRFP,
      biotech_name: parsedRFP.biotech_name ?? null,
      status: 'parsed',
    })
    .select('id')
    .single();

  if (dbError) {
    console.error('DB error saving RFP:', dbError);
    Sentry.captureException(new Error(dbError.message), {
      tags: { component: 'supabase', operation: 'rfp_insert' },
      extra: { code: dbError.code },
    });
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Send Template 1 — RFP parsed (fire-and-forget, never blocks response)
  ;(async () => {
    try {
      const wantsEmail = await userWantsEmail(user.id, 'rfp_parsed');
      if (!wantsEmail) return;
      const { data: profileData } = await supabase
        .from('cro_profiles')
        .select('company_name')
        .eq('id', croProfileId)
        .single();
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) return;
      const { subject, html } = rfpParsedTemplate({
        biotechName: parsedRFP.biotech_name ?? 'Unknown Sponsor',
        studyType: parsedRFP.study_type ?? '',
        rfpId: rfpRow.id,
        croName: profileData?.company_name ?? 'Team',
      });
      await sendEmail({ to: email, subject, html, templateName: 'rfp_parsed', userId: user.id });
    } catch { /* never surface email errors to the user */ }
  })();

  return NextResponse.json({
    rfp_id: rfpRow.id,
    parsed: parsedRFP,
  });
}

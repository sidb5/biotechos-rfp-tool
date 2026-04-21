// POST /api/knowledge-repo/upload
// Accepts PDF, DOCX, or TXT; extracts plain text; stores in knowledge_repo_docs.
// Limits: 25 docs per CRO, 10MB per file.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DOCS_PER_CRO = 25;

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
  }

  // Check doc count limit
  const { count } = await supabase
    .from('knowledge_repo_docs')
    .select('id', { count: 'exact', head: true })
    .eq('cro_user_id', user.id);

  if ((count ?? 0) >= MAX_DOCS_PER_CRO) {
    return NextResponse.json(
      { error: `Document limit reached (${MAX_DOCS_PER_CRO} max). Delete a document before uploading more.` },
      { status: 400 }
    );
  }

  const fileName = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rawText = '';
  let fileType: 'pdf' | 'docx' | 'txt';

  try {
    if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      rawText = await extractTextFromPDF(buffer);
      fileType = 'pdf';
    } else if (
      fileName.endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      rawText = await extractTextFromDocx(buffer);
      fileType = 'docx';
    } else if (fileName.endsWith('.txt') || file.type === 'text/plain') {
      rawText = buffer.toString('utf-8');
      fileType = 'txt';
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, Word (.docx), or plain text (.txt) file.' },
        { status: 400 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { error: `Could not extract text from file: ${msg}. Make sure the file is not a scanned image PDF.` },
      { status: 400 }
    );
  }

  rawText = rawText.trim();
  if (!rawText) {
    return NextResponse.json(
      { error: 'No text could be extracted. The file may be empty or an image-only PDF.' },
      { status: 400 }
    );
  }

  const { data: doc, error: dbError } = await supabase
    .from('knowledge_repo_docs')
    .insert({
      cro_user_id: user.id,
      filename: file.name,
      file_type: fileType,
      raw_text: rawText,
    })
    .select('id, filename, file_type, created_at')
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ doc });
}

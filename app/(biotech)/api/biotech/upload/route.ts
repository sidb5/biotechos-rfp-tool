import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_TYPES = ['pdf', 'docx', 'txt', 'pptx'] as const;

export async function POST(req: NextRequest) {
  let file: File | null = null;

  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const filename = file.name;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  if (!(ALLOWED_TYPES as readonly string[]).includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type ".${ext}". Use PDF, DOCX, TXT, or PPTX.` },
      { status: 400 }
    );
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 20 MB limit.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = '';

  try {
    if (ext === 'pdf') {
      // pdf-parse is in serverComponentsExternalPackages — import at runtime
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(buffer);
      text = result.text;

    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;

    } else if (ext === 'txt') {
      text = buffer.toString('utf-8');

    } else if (ext === 'pptx') {
      // PPTX is a ZIP of XML files. Extract text from slide XML using adm-zip.
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(buffer);
      const slideTexts: string[] = [];

      for (const entry of zip.getEntries()) {
        // Slides live at ppt/slides/slide{n}.xml
        if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)) {
          const xml = entry.getData().toString('utf-8');
          // <a:t> tags hold text runs in DrawingML
          const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
          const slideText = matches
            .map(m => m.replace(/<[^>]+>/g, ''))
            .filter(Boolean)
            .join(' ');
          if (slideText.trim()) slideTexts.push(slideText.trim());
        }
      }

      text = slideTexts.join('\n\n');

      if (!text.trim()) {
        return NextResponse.json(
          { error: 'Could not extract text from this PPTX. Try saving as PDF first.' },
          { status: 422 }
        );
      }
    }
  } catch (err) {
    console.error('[biotech/upload] extraction error:', err);
    return NextResponse.json(
      { error: 'Failed to extract text. The file may be corrupted or password-protected.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    filename,
    text: text.trim(),
    charCount: text.trim().length,
  });
}

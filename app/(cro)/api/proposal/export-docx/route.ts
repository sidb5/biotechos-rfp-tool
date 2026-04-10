import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  Header, Footer, PageNumber, AlignmentType, NumberFormat,
  ImageRun,
} from 'docx';

const SECTION_ORDER = [
  'executive_summary',
  'technical_approach',
  'team_qualifications',
  'facility_overview',
  'proposed_timeline',
  'pricing',
  'assumptions_exclusions',
];

const SECTION_LABELS: Record<string, string> = {
  executive_summary:      'Executive Summary',
  technical_approach:     'Technical Approach',
  team_qualifications:    'Team Qualifications',
  facility_overview:      'Facility & Infrastructure Overview',
  proposed_timeline:      'Proposed Timeline',
  pricing:                'Pricing',
  assumptions_exclusions: 'Assumptions & Exclusions',
};

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function contentToParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = (content ?? '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(4),
        heading: HeadingLevel.HEADING_3,
      }));
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(3),
        heading: HeadingLevel.HEADING_2,
      }));
    } else if (trimmed.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(2),
        heading: HeadingLevel.HEADING_1,
      }));
    // Bullet points
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(2),
        bullet: { level: 0 },
      }));
    // Numbered list
    } else if (/^\d+\. /.test(trimmed)) {
      paragraphs.push(new Paragraph({
        text: trimmed.replace(/^\d+\. /, ''),
        numbering: { reference: 'default-numbering', level: 0 },
      }));
    // Table separator rows — skip
    } else if (/^\|[-: |]+\|$/.test(trimmed)) {
      // skip markdown table separator
    // Table data rows
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
      paragraphs.push(
        // We'll handle tables separately — for now render as tab-separated text
        new Paragraph({
          children: cells.map((c, i) => new TextRun({
            text: c + (i < cells.length - 1 ? '\t' : ''),
            bold: false,
          })),
        })
      );
    // Horizontal rule
    } else if (/^---+$/.test(trimmed)) {
      paragraphs.push(new Paragraph({ text: '─'.repeat(50) }));
    // Regular paragraph
    } else {
      // Handle inline bold **text**
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/);
      const runs = parts.map(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return new TextRun({ text: part.slice(2, -2), bold: true });
        }
        return new TextRun({ text: part });
      });
      paragraphs.push(new Paragraph({ children: runs }));
    }
  }

  return paragraphs;
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let proposalId: string;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    if (!proposalId) throw new Error('missing proposal_id');
  } catch {
    return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
  }

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, rfp_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('company_name, logo_url')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rfp } = await supabase
    .from('rfps')
    .select('biotech_name, parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  const { data: sections } = await supabase
    .from('proposal_sections')
    .select('section_name, content')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });

  const croName = profile.company_name ?? 'CRO';
  const biotechName = rfp?.biotech_name ?? 'Sponsor';
  const parsedSummary = rfp?.parsed_summary as { study_type?: string } | null;
  const studyType = parsedSummary?.study_type ?? 'Preclinical Study';
  const proposalDate = formatDate(new Date());
  const logoUrl = (profile as Record<string, string | null>).logo_url ?? null;

  // Fetch logo image buffer if available
  let logoBuffer: Buffer | null = null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch { /* skip logo if fetch fails */ }
  }

  const orderedSections = SECTION_ORDER
    .map(name => (sections ?? []).find(s => s.section_name === name))
    .filter(Boolean) as { section_name: string; content: string }[];

  // Build document children
  const children: Paragraph[] = [
    // Cover
    new Paragraph({ text: '', spacing: { before: 2000 } }),
    new Paragraph({
      text: 'CONFIDENTIAL PROPOSAL',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: `Proposal to ${biotechName}`,
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: studyType,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '', spacing: { before: 400 } }),
    new Paragraph({
      children: [new TextRun({ text: `Prepared by: `, bold: true }), new TextRun(croName)],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Prepared for: `, bold: true }), new TextRun(biotechName)],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Date: `, bold: true }), new TextRun(proposalDate)],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '', pageBreakBefore: true }),
  ];

  // Sections
  for (const section of orderedSections) {
    const label = SECTION_LABELS[section.section_name] ?? section.section_name;
    children.push(
      new Paragraph({
        text: label,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
      new Paragraph({ text: '' }),
      ...contentToParagraphs(section.content),
    );
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: NumberFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
        }],
      }],
    },
    sections: [{
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              ...(logoBuffer
                ? [new ImageRun({
                    data: logoBuffer,
                    transformation: { width: 120, height: 40 },
                    type: logoUrl?.includes('.svg') ? 'png' : (logoUrl?.includes('.png') ? 'png' : 'jpg'),
                  })]
                : [new TextRun({ text: croName, bold: true })]
              ),
              new TextRun({ text: '  — Confidential', color: '9ca3af' }),
            ],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun('Page '),
              new TextRun({ children: [PageNumber.CURRENT] }),
              new TextRun(' of '),
              new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
              new TextRun(`  |  ${proposalDate}`),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await Packer.toBuffer(doc));
  } catch (err) {
    console.error('[export-docx] error:', err);
    return NextResponse.json(
      { error: `Word generation failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    );
  }

  const filename = `${slugify(croName)}_proposal_${slugify(biotechName)}_${new Date().toISOString().slice(0, 10)}.docx`;

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}

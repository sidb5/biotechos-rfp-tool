import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  Header, Footer, PageNumber, AlignmentType, NumberFormat,
  ImageRun, ShadingType,
} from 'docx';

const SECTION_ORDER = [
  'executive_summary',
  'technical_approach',
  'team_qualifications',
  'facility_overview',
  'proposed_timeline',
  'assumptions_exclusions',
  'pricing',
];

const SECTION_LABELS: Record<string, string> = {
  executive_summary:      'Executive Summary',
  technical_approach:     'Technical Approach',
  team_qualifications:    'Team Qualifications',
  facility_overview:      'Facility & Infrastructure Overview',
  proposed_timeline:      'Proposed Timeline',
  assumptions_exclusions: 'Assumptions & Exclusions',
  pricing:                'Pricing',
};

interface InvestmentRow { item: string; qty: string; unit_price: string; total: string; }

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Strip leading markdown heading from AI content — the section label is already rendered as a heading
function stripLeadingHeading(content: string): string {
  return (content ?? '').replace(/^#{1,3} [^\n]*\n?/, '').trimStart();
}

// Parse PNG dimensions from buffer header (bytes 16–23)
function pngDimensions(buf: Buffer): { w: number; h: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
  } catch { /* ignore */ }
  return null;
}

// Scale image to fit within maxW × maxH, preserving aspect ratio
function logoTransform(buf: Buffer): { width: number; height: number } {
  const maxW = 150, maxH = 50;
  const dim = pngDimensions(buf);
  if (dim && dim.w > 0 && dim.h > 0) {
    const ratio = Math.min(maxW / dim.w, maxH / dim.h);
    return { width: Math.round(dim.w * ratio), height: Math.round(dim.h * ratio) };
  }
  // Fallback: assume 2:1 landscape
  return { width: 100, height: 50 };
}

// Convert markdown section content to docx Paragraphs
// Parse a markdown table block (array of raw lines) into a Word Table
function mdTableToWordTable(tableLines: string[]): Table {
  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
  const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  const isSeparator = (l: string) => /^\|[-:| ]+\|$/.test(l.trim());
  const parseRow = (l: string): string[] =>
    l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  const dataLines = tableLines.filter(l => !isSeparator(l));
  if (!dataLines.length) {
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [] });
  }

  const wordRows = dataLines.map((line, rowIdx) => {
    const cells = parseRow(line);
    const isHeader = rowIdx === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: cells.map(cellText =>
        new TableCell({
          borders,
          shading: isHeader ? { type: ShadingType.SOLID, fill: 'F3F4F6' } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: cellText, bold: isHeader, size: 18 })],
            spacing: { before: 60, after: 60 },
          })],
        })
      ),
    });
  });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: wordRows });
}

// Convert markdown section content to docx Paragraphs (and Tables for markdown tables)
function contentToParagraphs(raw: string): Array<Paragraph | Table> {
  const content = stripLeadingHeading(raw);
  const result: Array<Paragraph | Table> = [];
  const lines = content.split('\n');

  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length) {
      result.push(mdTableToWordTable(tableBuffer));
      result.push(new Paragraph({ text: '' }));
      tableBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect markdown table lines (and ignore blank lines mid-table)
    if (/^\|[-:| ]+\|$/.test(trimmed) || (trimmed.startsWith('|') && trimmed.endsWith('|'))) {
      tableBuffer.push(trimmed);
      continue;
    }
    if (!trimmed && tableBuffer.length) {
      // Blank line inside/between table rows — skip, don't flush
      continue;
    }

    // Flush any accumulated table before processing non-table line
    flushTable();

    if (!trimmed) {
      result.push(new Paragraph({ text: '', spacing: { before: 60 } }));
    } else if (trimmed.startsWith('### ')) {
      result.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (trimmed.startsWith('## ')) {
      result.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (trimmed.startsWith('# ')) {
      result.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      result.push(new Paragraph({ text: trimmed.slice(2), bullet: { level: 0 } }));
    } else if (/^\d+\. /.test(trimmed)) {
      result.push(new Paragraph({
        text: trimmed.replace(/^\d+\. /, ''),
        numbering: { reference: 'default-numbering', level: 0 },
      }));
    } else if (/^---+$/.test(trimmed)) {
      result.push(new Paragraph({ text: '' }));
    } else {
      // Inline bold **text** and italic *text*
      const parts = trimmed.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
      const runs = parts.map(part => {
        if (part.startsWith('**') && part.endsWith('**')) return new TextRun({ text: part.slice(2, -2), bold: true });
        if (part.startsWith('*') && part.endsWith('*')) return new TextRun({ text: part.slice(1, -1), italics: true });
        return new TextRun({ text: part });
      });
      result.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
    }
  }

  flushTable(); // flush any trailing table
  return result;
}

// Build a proper Word table from investment rows
function buildPricingTable(rows: InvestmentRow[]): Array<Paragraph | Table> {
  const filled = rows.filter(r => r.item.trim());
  if (!filled.length) {
    return [new Paragraph({ children: [new TextRun({ text: 'Pricing to be confirmed — contact us for a detailed quote.', italics: true })] })];
  }

  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
  const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Line Item', 'Qty', 'Unit Cost', 'Total'].map(text =>
      new TableCell({
        borders,
        shading: { type: ShadingType.SOLID, fill: 'F3F4F6' },
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, size: 18 })],
          spacing: { before: 60, after: 60 },
        })],
      })
    ),
  });

  const dataRows = filled.map(row =>
    new TableRow({
      children: [
        new TableCell({ borders, children: [new Paragraph({ text: row.item, spacing: { before: 60, after: 60 } })] }),
        new TableCell({ borders, children: [new Paragraph({ text: row.qty || '—', spacing: { before: 60, after: 60 } })] }),
        new TableCell({ borders, children: [new Paragraph({ text: row.unit_price || '—', spacing: { before: 60, after: 60 } })] }),
        new TableCell({ borders, children: [new Paragraph({ text: row.total || '—', spacing: { before: 60, after: 60 } })] }),
      ],
    })
  );

  // Total row
  const totalValue = filled.reduce((sum, r) => {
    const t = parseFloat(r.total.replace(/[$,]/g, ''));
    return sum + (isNaN(t) ? 0 : t);
  }, 0);

  const totalRow = new TableRow({
    children: [
      new TableCell({
        borders, columnSpan: 3,
        shading: { type: ShadingType.SOLID, fill: 'F9FAFB' },
        children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true })], spacing: { before: 60, after: 60 } })],
      }),
      new TableCell({
        borders,
        shading: { type: ShadingType.SOLID, fill: 'F9FAFB' },
        children: [new Paragraph({
          children: [new TextRun({ text: totalValue > 0 ? `$${totalValue.toLocaleString('en-US')}` : '—', bold: true })],
          spacing: { before: 60, after: 60 },
        })],
      }),
    ],
  });

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows, totalRow],
    }),
    new Paragraph({ text: '' }),
  ];
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    .select('id, cro_id, rfp_id, quote_data')
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
  const quoteData = proposal.quote_data as { investment?: InvestmentRow[] } | null;
  const investmentRows: InvestmentRow[] = quoteData?.investment ?? [];

  // Fetch logo buffer for correct aspect ratio
  let logoBuffer: Buffer | null = null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch { /* skip */ }
  }

  const orderedSections = SECTION_ORDER
    .map(name => (sections ?? []).find(s => s.section_name === name))
    .filter(Boolean) as { section_name: string; content: string }[];

  // Cover page
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: '', spacing: { before: 2000 } }),
    new Paragraph({ text: 'CONFIDENTIAL PROPOSAL', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: `Proposal to ${biotechName}`, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: studyType, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '', spacing: { before: 400 } }),
    new Paragraph({
      children: [new TextRun({ text: 'Prepared by: ', bold: true }), new TextRun(croName)],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Prepared for: ', bold: true }), new TextRun(biotechName)],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Date: ', bold: true }), new TextRun(proposalDate)],
      alignment: AlignmentType.CENTER,
    }),
    // Page break after cover
    new Paragraph({ text: '', pageBreakBefore: true }),
  ];

  // Sections — NO forced page break between them; content flows naturally
  for (let i = 0; i < orderedSections.length; i++) {
    const section = orderedSections[i];
    const label = SECTION_LABELS[section.section_name] ?? section.section_name;

    // Section heading — page break only before sections after the first
    children.push(
      new Paragraph({
        text: label,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: i > 0 ? 480 : 0, after: 200 },
      }),
    );

    if (section.section_name === 'pricing') {
      // Render the investment grid as a proper Word table
      children.push(...buildPricingTable(investmentRows));
    } else {
      children.push(...contentToParagraphs(section.content));
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0, format: NumberFormat.DECIMAL, text: '%1.',
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
                    transformation: logoTransform(logoBuffer),
                    type: logoUrl?.toLowerCase().includes('.png') ? 'png' : 'jpg',
                  })]
                : []
              ),
              new TextRun({ text: logoBuffer ? '  ' : '', }),
              new TextRun({ text: croName, bold: true }),
              new TextRun({ text: '  —  Confidential', color: '9ca3af' }),
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

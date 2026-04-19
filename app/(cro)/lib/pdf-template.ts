export interface ProposalPDFData {
  croName: string;
  biotechName: string;
  studyType: string;
  proposalDate: string;
  sections: { name: string; label: string; content: string }[];
  logoUrl?: string | null;
  /** Investment rows for the pricing table (from quote_data.investment) */
  investmentRows?: { item: string; qty: string; unit_price: string; total: string }[];
  /** Share token for generating recipient landing page URL (Mechanic D) */
  shareToken?: string | null;
  /** Whether to show the free-plan powered-by footer (Mechanic A) */
  showWatermark?: boolean;
}

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
  pricing:                'Pricing',
  assumptions_exclusions: 'Assumptions & Exclusions',
};

// Strip the leading ## Heading line that AI content starts with (section label already rendered separately)
function stripLeadingHeading(content: string): string {
  return (content ?? '').replace(/^#{1,3} [^\n]*\n?/, '').trimStart();
}

// Convert a markdown table block to an HTML table
function mdTableToHtml(block: string): string {
  const lines = block.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return block;
  const parseRow = (line: string) =>
    line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const isSeparator = (line: string) => /^\|[-:| ]+\|$/.test(line.trim());
  const headerCells = parseRow(lines[0]);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    if (!isSeparator(lines[i])) rows.push(parseRow(lines[i]));
  }
  const thead = `<thead><tr>${headerCells.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

// Convert markdown-style content to basic HTML
function markdownToHtml(text: string): string {
  // Strip leading heading first
  const cleaned = stripLeadingHeading(text);

  // Split into blocks, handle markdown tables as whole units
  const lines = cleaned.split('\n');
  const blocks: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const isTableLine = /^\|.+\|$/.test(line.trim());
    if (isTableLine) {
      inTable = true;
      tableLines.push(line);
    } else {
      if (inTable) {
        blocks.push('__TABLE__' + tableLines.join('\n') + '__ENDTABLE__');
        tableLines = [];
        inTable = false;
      }
      blocks.push(line);
    }
  }
  if (inTable && tableLines.length) {
    blocks.push('__TABLE__' + tableLines.join('\n') + '__ENDTABLE__');
  }

  let result = blocks.join('\n');

  // Replace table markers
  result = result.replace(/__TABLE__([\s\S]*?)__ENDTABLE__/g, (_, t) => mdTableToHtml(t));

  return result
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr>')
    // Bullet lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines to <br>
    .replace(/\n/g, '<br>');
}

function wrapLists(html: string): string {
  return html.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g, '<ul>$1</ul>');
}

function buildPricingTableHtml(rows: { item: string; qty: string; unit_price: string; total: string }[]): string {
  const filled = rows.filter(r => r.item.trim());
  if (!filled.length) return '<p><em>Pricing to be confirmed — contact us for a detailed quote.</em></p>';
  const total = filled.reduce((sum, r) => {
    const t = parseFloat(r.total.replace(/[$,]/g, ''));
    return sum + (isNaN(t) ? 0 : t);
  }, 0);
  const dataRows = filled.map(r => `
    <tr>
      <td>${r.item}</td>
      <td style="text-align:right">${r.qty || '—'}</td>
      <td style="text-align:right">${r.unit_price || '—'}</td>
      <td style="text-align:right;font-weight:bold">${r.total || '—'}</td>
    </tr>`).join('');
  return `
    <table>
      <thead>
        <tr>
          <th>Line Item</th><th style="text-align:right">Qty</th>
          <th style="text-align:right">Unit Cost</th><th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${dataRows}
        <tr style="background:#f9fafb">
          <td colspan="3" style="font-weight:bold">Total</td>
          <td style="text-align:right;font-weight:bold">${total > 0 ? `$${total.toLocaleString('en-US')}` : '—'}</td>
        </tr>
      </tbody>
    </table>`;
}

export function buildProposalHTML(data: ProposalPDFData): string {
  // Sections excluding pricing (handled separately with investment rows)
  const nonPricingSections = SECTION_ORDER.filter(n => n !== 'pricing')
    .map(name => data.sections.find(s => s.name === name))
    .filter(Boolean) as { name: string; label: string; content: string }[];

  // Always include pricing as the last section in TOC
  const allSectionNames = [...nonPricingSections.map(s => s.name), 'pricing'];

  const tocItems = allSectionNames
    .map((name, i) => `<li>${i + 1}. ${SECTION_LABELS[name] ?? name.replace(/_/g, ' ')}</li>`)
    .join('');

  const sectionPages = nonPricingSections.map((s, i) => {
    let html = markdownToHtml(s.content ?? '');
    html = wrapLists(html);
    // First section gets no extra top margin; subsequent ones get spacing but NO forced page break
    const topStyle = i === 0 ? '' : 'margin-top:48px;';
    return `
      <div class="section" style="${topStyle}">
        <h2 class="section-title">${SECTION_LABELS[s.name] ?? s.label}</h2>
        <div class="section-content"><p>${html}</p></div>
      </div>`;
  }).join('');

  // Pricing section at the end
  const investmentRows = data.investmentRows ?? [];
  const pricingSection = `
    <div class="section" style="margin-top:48px;">
      <h2 class="section-title">Pricing</h2>
      <div class="section-content">${buildPricingTableHtml(investmentRows)}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal — ${data.biotechName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
    }

    /* Cover page */
    .cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 100vh;
      padding: 80px 72px;
      background: #ffffff;
    }
    .cover-label {
      font-family: 'Arial', sans-serif;
      font-size: 9pt;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 40px;
    }
    .cover-title {
      font-size: 28pt;
      font-weight: bold;
      color: #111827;
      line-height: 1.2;
      margin-bottom: 12px;
    }
    .cover-subtitle {
      font-size: 14pt;
      color: #374151;
      margin-bottom: 48px;
    }
    .cover-meta {
      border-top: 2px solid #16a34a;
      padding-top: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .cover-meta-item { }
    .cover-meta-label {
      font-family: 'Arial', sans-serif;
      font-size: 8pt;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #9ca3af;
    }
    .cover-meta-value {
      font-size: 11pt;
      font-weight: bold;
      color: #111827;
      margin-top: 2px;
    }
    .cover-confidential {
      position: absolute;
      bottom: 48px;
      left: 72px;
      right: 72px;
      font-family: 'Arial', sans-serif;
      font-size: 8pt;
      color: #9ca3af;
      text-align: center;
    }

    /* TOC */
    .toc {
      padding: 72px;
      page-break-after: always;
    }
    .toc h2 {
      font-size: 18pt;
      color: #111827;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .toc ul {
      list-style: none;
      padding: 0;
    }
    .toc li {
      padding: 8px 0;
      font-size: 11pt;
      border-bottom: 1px dotted #e5e7eb;
      color: #374151;
    }

    /* Sections */
    .section {
      padding: 72px;
    }
    .section-title {
      font-size: 18pt;
      color: #111827;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 2px solid #16a34a;
    }
    .section-content p {
      margin-bottom: 12px;
      color: #374151;
    }
    .section-content h1,
    .section-content h2 { font-size: 13pt; color: #111827; margin: 16px 0 8px; }
    .section-content h3 { font-size: 11pt; color: #374151; margin: 12px 0 6px; font-weight: bold; }
    .section-content ul {
      padding-left: 20px;
      margin: 8px 0 12px;
    }
    .section-content li {
      margin-bottom: 4px;
      color: #374151;
    }
    .section-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 10pt;
    }
    .section-content td, .section-content th {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
      vertical-align: top;
    }
    .section-content thead th {
      background: #f3f4f6;
      font-weight: bold;
    }
    .section-content tr:nth-child(even) td {
      background: #fafafa;
    }
    .section-content strong { color: #111827; }
    .section-content em { font-style: italic; }
    .section-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }

    /* Footer */
    @page {
      margin: 0;
      @bottom-center {
        content: "${data.croName}  |  Confidential  |  ${data.proposalDate}  |  Page " counter(page);
        font-family: Arial, sans-serif;
        font-size: 8pt;
        color: #9ca3af;
      }
    }
  </style>
</head>
<body>

  <!-- Cover page -->
  <div class="cover" style="position:relative;">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;">
      ${data.logoUrl
        ? `<img src="${data.logoUrl}" alt="${data.croName} logo" style="max-width:160px;max-height:64px;object-fit:contain;" />`
        : ''
      }
      <div class="cover-label" style="margin-bottom:0">${data.croName}</div>
    </div>
    <div class="cover-title">Proposal to ${data.biotechName}</div>
    <div class="cover-subtitle">${data.studyType}</div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Prepared by</div>
        <div class="cover-meta-value">${data.croName}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Date</div>
        <div class="cover-meta-value">${data.proposalDate}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Prepared for</div>
        <div class="cover-meta-value">${data.biotechName}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Study type</div>
        <div class="cover-meta-value">${data.studyType}</div>
      </div>
    </div>
    <div class="cover-confidential">
      This document is confidential and intended solely for the use of ${data.biotechName}.
      Do not distribute without written consent from ${data.croName}.
    </div>
  </div>

  <!-- Table of contents -->
  <div class="toc">
    <h2>Table of Contents</h2>
    <ul>${tocItems}</ul>
  </div>

  <!-- Proposal sections -->
  ${sectionPages}
  ${pricingSection}

</body>
</html>`;
}

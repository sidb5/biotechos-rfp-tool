export interface ProposalPDFData {
  croName: string;
  biotechName: string;
  studyType: string;
  proposalDate: string;
  sections: { name: string; label: string; content: string }[];
  logoUrl?: string | null;
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

// Convert markdown-style content to basic HTML
function markdownToHtml(text: string): string {
  return text
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
    // Table rows (simple pipe-delimited)
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.slice(1, -1).split('|').map(c => c.trim());
      const isHeader = false;
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    })
    // Separator rows in tables (e.g. |---|---|)
    .replace(/<tr><td>[-: ]+<\/td>(<td>[-: ]+<\/td>)*<\/tr>/g, '')
    // Bullet lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines to <br> inside paragraphs
    .replace(/\n/g, '<br>');
}

function wrapTables(html: string): string {
  // Wrap consecutive <tr> blocks in <table>
  return html.replace(/(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g, '<table>$1</table>');
}

function wrapLists(html: string): string {
  return html.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g, '<ul>$1</ul>');
}

export function buildProposalHTML(data: ProposalPDFData): string {
  const orderedSections = SECTION_ORDER
    .map(name => data.sections.find(s => s.name === name))
    .filter(Boolean) as { name: string; label: string; content: string }[];

  const tocItems = orderedSections
    .map((s, i) => `<li>${i + 1}. ${SECTION_LABELS[s.name] ?? s.label}</li>`)
    .join('');

  const sectionPages = orderedSections.map(s => {
    let html = markdownToHtml(s.content ?? '');
    html = wrapTables(html);
    html = wrapLists(html);
    return `
      <div class="section page-break">
        <h2 class="section-title">${SECTION_LABELS[s.name] ?? s.label}</h2>
        <div class="section-content"><p>${html}</p></div>
      </div>`;
  }).join('');

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
    .page-break {
      page-break-before: always;
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
    .section-content tr:first-child td {
      background: #f9fafb;
      font-weight: bold;
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
    ${data.logoUrl
      ? `<img src="${data.logoUrl}" alt="${data.croName} logo" style="max-width:200px;max-height:80px;object-fit:contain;margin-bottom:32px;" />`
      : `<div class="cover-label">Proposal — Confidential</div>`
    }
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

</body>
</html>`;
}

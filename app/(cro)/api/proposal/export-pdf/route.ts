import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { getPlan } from '@shared/lib/get-plan';
import { canAccess } from '@shared/lib/feature-flags';
import { buildProposalHTML } from '@cro/lib/pdf-template';

// Force Node.js runtime (required for puppeteer-core + chromium)
export const runtime = 'nodejs';
// Give the function enough time to spin up Chromium and render
export const maxDuration = 60;

const SECTION_ORDER = [
  'executive_summary',
  'technical_approach',
  'team_qualifications',
  'facility_overview',
  'proposed_timeline',
  'pricing',
  'assumptions_exclusions',
];

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

  // Fetch proposal and verify ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, rfp_id, created_at, quote_data')
    .eq('id', proposalId)
    .single();

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('company_name, logo_url')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const parsedSummary = rfp?.parsed_summary as { study_type?: string } | null;
  const croName = profile.company_name ?? 'CRO';
  const biotechName = rfp?.biotech_name ?? 'Sponsor';
  const studyType = parsedSummary?.study_type ?? 'Preclinical Study';
  const proposalDate = formatDate(new Date());
  const logoUrl = (profile as Record<string, string | null>).logo_url ?? null;
  const quoteData = proposal.quote_data as { investment?: { item: string; qty: string; unit_price: string; total: string }[] } | null;
  const investmentRows = quoteData?.investment ?? [];

  const orderedSections = SECTION_ORDER
    .map(name => (sections ?? []).find(s => s.section_name === name))
    .filter(Boolean)
    .map(s => ({ name: s!.section_name, label: s!.section_name, content: s!.content ?? '' }));

  // Watermark / powered-by footer for free tier
  const plan = await getPlan(proposal.cro_id);
  const showWatermark = canAccess('watermark', plan) as boolean;

  // Share token for Mechanic D recipient landing page URL (already fetched in proposal)
  const shareToken = (proposal as Record<string, unknown>).share_token as string | null ?? null;

  const html = buildProposalHTML({
    croName, biotechName, studyType, proposalDate,
    sections: orderedSections, logoUrl,
    investmentRows, shareToken, showWatermark,
  });

  // Generate PDF with puppeteer-core + @sparticuz/chromium (Vercel-compatible)
  let pdfBuffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chromium = require('@sparticuz/chromium') as typeof import('@sparticuz/chromium');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer-core') as typeof import('puppeteer-core');

    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '40px', left: '0' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;padding:8px 72px 0;box-sizing:border-box;display:flex;align-items:center;gap:8px;justify-content:flex-end;">
        ${logoUrl ? `<img src="${logoUrl}" style="max-height:28px;max-width:100px;object-fit:contain;" />` : ''}
        <span style="font-family:Arial,sans-serif;font-size:9pt;font-weight:bold;color:#111827;">${croName}</span>
        <span style="font-family:Arial,sans-serif;font-size:9pt;color:#9ca3af;">— Confidential</span>
      </div>`,
      footerTemplate: (() => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://proposal-engine.vercel.app';
        const trackingUrl = shareToken
          ? `${appUrl}/r/export?source=pdf&token=${shareToken}`
          : `${appUrl}/r/export?source=pdf`;
        const leftText = showWatermark
          ? `Proposal created with <a href="${trackingUrl}" style="color:#16a34a;text-decoration:none;">Proposal Engine</a> — Free Plan`
          : `${croName} — Confidential`;
        return `
        <div style="width:100%; font-family:Arial,sans-serif; font-size:8pt; color:#9ca3af;
                    display:flex; justify-content:space-between; padding:0 72px; box-sizing:border-box;">
          <span>${leftText}</span>
          <span>${proposalDate}</span>
          <span>Page <span class="pageNumber"></span></span>
        </div>`;
      })(),
    });
    await browser.close();
    pdfBuffer = Buffer.from(pdf);
  } catch (err) {
    console.error('[export-pdf] Puppeteer error:', err);
    Sentry.captureException(err, {
      tags: { component: 'pdf_export' },
      extra: { proposalId },
    });
    return NextResponse.json(
      { error: `PDF generation failed: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 500 }
    );
  }

  const filename = `${slugify(croName)}_proposal_${slugify(biotechName)}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}

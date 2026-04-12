'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import { SECTION_KEYS, SECTION_META, type SectionKey } from '@biotech/prompts/rfp';

interface RfpDoc {
  id:                 string;
  rfp_id:             string;
  completeness_score: number;
  updated_at:         string;
  [key: string]:      unknown;
}

interface Brief {
  id:    string;
  title: string | null;
}

interface Settings {
  company_name?:        string | null;
  sender_display_name?: string | null;
  sender_email?:        string | null;
}

// ── Inline renderer: **bold** and [TO BE SPECIFIED] ───────────────────────────

function renderInlinePrint(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[TO BE SPECIFIED[^\]]*\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('[TO BE SPECIFIED')) {
      return (
        <mark key={`${keyPrefix}-m${i}`} className="bg-amber-100 text-amber-800 font-medium px-0.5 rounded print:bg-yellow-100">
          {part}
        </mark>
      );
    }
    return part;
  });
}

// ── Render a section with full markdown support ───────────────────────────────

function SectionText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);

  return (
    <div className="rfp-section-body">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter(l => l.trim());
        if (lines.length === 0) return null;
        const first = lines[0].trim();

        // # Heading
        if (first.startsWith('# ')) {
          return (
            <h3 key={bi} className="text-sm font-bold text-indigo-900 mt-4 mb-1">
              {renderInlinePrint(first.slice(2), `${bi}`)}
            </h3>
          );
        }

        // ## Subheading
        if (first.startsWith('## ')) {
          return (
            <h4 key={bi} className="text-sm font-semibold text-gray-700 mt-3 mb-1">
              {renderInlinePrint(first.slice(3), `${bi}`)}
            </h4>
          );
        }

        // Bullet list
        const isBullet = lines.every(l => /^[-*]\s/.test(l.trim()));
        if (isBullet) {
          return (
            <ul key={bi} className="mb-3 pl-5 space-y-0.5" style={{ listStyleType: 'disc' }}>
              {lines.map((l, li) => (
                <li key={li} className="text-sm text-gray-800 leading-relaxed">
                  {renderInlinePrint(l.trim().replace(/^[-*]\s+/, ''), `${bi}-${li}`)}
                </li>
              ))}
            </ul>
          );
        }

        // Numbered list
        const isNumbered = lines.every(l => /^\d+\.\s/.test(l.trim()));
        if (isNumbered) {
          return (
            <ol key={bi} className="mb-3 pl-5 space-y-0.5" style={{ listStyleType: 'decimal' }}>
              {lines.map((l, li) => (
                <li key={li} className="text-sm text-gray-800 leading-relaxed">
                  {renderInlinePrint(l.trim().replace(/^\d+\.\s+/, ''), `${bi}-${li}`)}
                </li>
              ))}
            </ol>
          );
        }

        // Plain paragraph
        return (
          <p key={bi} className="mb-3 leading-relaxed text-sm text-gray-800">
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderInlinePrint(line, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default function RfpPrintPage() {
  const params  = useParams();
  const briefId = params.id as string;

  const [brief, setBrief]       = useState<Brief | null>(null);
  const [rfpDoc, setRfpDoc]     = useState<RfpDoc | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: briefData }, { data: rfpData }, { data: settingsData }] = await Promise.all([
      supabase.from('rfp_internal_briefs').select('id, title').eq('id', briefId).single(),
      supabase.from('rfp_documents').select('*').eq('brief_id', briefId).maybeSingle(),
      supabase.from('biotech_user_settings')
        .select('company_name, sender_display_name, sender_email')
        .eq('user_id', user.id).maybeSingle(),
    ]);

    if (briefData)    setBrief(briefData as Brief);
    if (rfpData)      setRfpDoc(rfpData as RfpDoc);
    if (settingsData) setSettings(settingsData as Settings);
    setLoading(false);
  }, [briefId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading RFP…</p>
      </div>
    );
  }

  if (!rfpDoc) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 font-medium mb-2">No RFP document found.</p>
          <a href={`/biotech/briefs/${briefId}/rfp`} className="text-blue-600 underline text-sm">
            Go to RFP editor →
          </a>
        </div>
      </div>
    );
  }

  const companyName   = settings?.company_name        ?? '[Company Name]';
  const contactName   = settings?.sender_display_name ?? '[Contact Name]';
  const contactEmail  = settings?.sender_email        ?? '[Contact Email]';
  const score         = rfpDoc.completeness_score ?? 0;
  const withGaps      = SECTION_KEYS.filter(k => {
    const t = (rfpDoc[k] as string | null) ?? '';
    return t.includes('[TO BE SPECIFIED]');
  }).length;

  return (
    <>
      {/* Print-specific styles injected via <style> tag */}
      <style>{`
        @media print {
          /* ── Step 1: Hide the shared layout shell ── */
          /* The biotech layout is: body > div.flex > aside + main */
          body > div { display: block !important; }
          body > div > aside { display: none !important; }
          /* Mobile top bar (div, not aside) */
          body > div > div:first-of-type { display: none !important; }

          /* ── Step 2: Hide toolbar and gap warnings ── */
          .no-print { display: none !important; }

          /* ── Step 3: Document area fills the page ── */
          .print-break { page-break-before: always; }
          body { background: white !important; margin: 0 !important; }
          .rfp-page { max-width: none !important; padding: 0 !important; }
        }
        @page { margin: 1.8cm 2.2cm; size: A4 portrait; }
      `}</style>

      {/* Print toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <a
            href={`/biotech/briefs/${briefId}/rfp/send`}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Back to Send
          </a>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-700 font-medium">{rfpDoc.rfp_id}</span>
          {withGaps > 0 && (
            <span className="rounded-full bg-amber-100 text-amber-700 text-xs px-2.5 py-0.5 font-medium">
              {withGaps} gap{withGaps !== 1 ? 's' : ''} remaining
            </span>
          )}
          <span className={`rounded-full text-xs px-2.5 py-0.5 font-medium ${
            score >= 80 ? 'bg-green-100 text-green-700' :
            score >= 50 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
          }`}>
            {score}/100
          </span>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          🖨 Print / Save as PDF
        </button>
      </div>

      {/* ── Document body ── */}
      <div className="rfp-page mx-auto max-w-[816px] bg-white px-12 py-10 text-gray-900 min-h-screen">

        {/* Cover block */}
        <div className="mb-10 border-b-2 border-indigo-800 pb-8">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-indigo-500 mb-2">
            Request for Proposal — Confidential
          </p>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {rfpDoc.rfp_id}
          </h1>
          <p className="text-lg text-gray-600 mt-1">
            {brief?.title ?? 'Preclinical Study'}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Issuing Company</span>
              <p className="text-gray-800 mt-0.5">{companyName}</p>
            </div>
            <div>
              <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Contact</span>
              <p className="text-gray-800 mt-0.5">{contactName}</p>
              <p className="text-gray-500 text-xs">{contactEmail}</p>
            </div>
            <div>
              <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Issue Date</span>
              <p className="text-gray-800 mt-0.5">
                {new Date(rfpDoc.updated_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Classification</span>
              <p className="text-gray-800 mt-0.5">Confidential</p>
            </div>
          </div>
          {withGaps > 0 && (
            <div className="no-print mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
              ⚠ This document contains {withGaps} unresolved [TO BE SPECIFIED] placeholder{withGaps !== 1 ? 's' : ''} — highlighted in yellow below.
            </div>
          )}
        </div>

        {/* ── Sections ── */}
        {SECTION_KEYS.map((key, idx) => {
          const text = (rfpDoc[key as SectionKey] as string | null) ?? '';
          const isEmpty = text.length < 10;
          return (
            <div key={key} className={`mb-10 ${idx > 0 ? '' : ''}`}>
              {/* Section heading */}
              <h2 className="text-base font-bold text-indigo-900 uppercase tracking-wide mb-3 pb-1.5 border-b border-indigo-100">
                {SECTION_META[key].label}
              </h2>

              {isEmpty ? (
                <p className="text-sm text-gray-400 italic">
                  [Section not yet generated]
                </p>
              ) : (
                <SectionText text={text} />
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div className="mt-12 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          <p>
            {rfpDoc.rfp_id} · Issued by {companyName} · Generated via BiotechOS
          </p>
          <p className="mt-1">
            This document is confidential. Do not distribute without prior written consent from {companyName}.
          </p>
        </div>
      </div>
    </>
  );
}

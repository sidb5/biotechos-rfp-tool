'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import { FIELD_META, type ExtractedData } from '@biotech/prompts/extract-brief';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Brief {
  id: string;
  title: string;
  classification: string | null;
  extracted_data: ExtractedData | null;
}

interface CRO {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  region: string | null;
  biosecure_compliant: boolean;
  specialties: string[] | null;
  size_category: string | null;
  glp_certified: boolean;
  contact_email: string | null;
  contact_name: string | null;
}

interface ManualEntry {
  id: string; // client-side uuid
  name: string;
  email: string;
}

type SizeFilter = 'any' | 'small' | 'mid' | 'large';

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchScore(cro: CRO, classification: string | null): number {
  if (!classification || !cro.specialties?.length) return 0;
  const cls = classification.toLowerCase();
  const hits = cro.specialties.filter(s => {
    const sp = s.toLowerCase();
    return sp === cls || sp.includes(cls) || cls.includes(sp);
  });
  return hits.length > 0 ? Math.round((hits.length / cro.specialties.length) * 100) : 0;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function clientId(): string {
  return Math.random().toString(36).slice(2);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BriefPage() {
  const router = useRouter();
  const params = useParams();
  const briefId = params.id as string;

  // Data
  const [brief, setBrief] = useState<Brief | null>(null);
  const [allCROs, setAllCROs] = useState<CRO[]>([]);
  const [sentEmails, setSentEmails] = useState<Set<string>>(new Set()); // emails already enquired
  const [loading, setLoading] = useState(true);

  // Filters
  const [biosecureOnly, setBiosecureOnly] = useState(true);
  const [glpOnly, setGlpOnly] = useState(false);
  const [regions, setRegions] = useState<string[]>(['US', 'EU', 'UK']);
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('any');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Manual entry fallback
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualEmailError, setManualEmailError] = useState('');

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [{ data: briefData }, { data: croData }, { data: engData }] = await Promise.all([
        supabase
          .from('rfp_internal_briefs')
          .select('id, title, classification, extracted_data')
          .eq('id', briefId)
          .single(),
        supabase
          .from('cros_directory')
          .select('id, name, city, country, region, biosecure_compliant, specialties, size_category, glp_certified, contact_email, contact_name')
          .order('name'),
        // Load existing engagements so we can mark already-contacted CROs
        supabase
          .from('cro_engagements')
          .select('cro_email, stage')
          .eq('brief_id', briefId)
          .in('stage', ['enquiry_sent', 'response_received', 'followup_draft',
                        'followup_sent', 'meeting_scheduled', 'meeting_done',
                        'rfp_draft', 'rfp_sent', 'awarded']),
      ]);

      if (briefData) setBrief(briefData as Brief);
      if (croData)   setAllCROs(croData as CRO[]);
      if (engData)   setSentEmails(new Set(engData.map(e => e.cro_email)));
      setLoading(false);
    }
    load();
  }, [briefId]);

  // ── Derived: should GLP toggle be visible? ──────────────────────────────────

  const showGlpToggle = useMemo(() => {
    const glp = brief?.extracted_data?.glp_requirement;
    return glp && glp.tag !== 'MISSING' && glp.value !== null;
  }, [brief]);

  // ── Filtered + scored CROs ─────────────────────────────────────────────────

  const filteredCROs = useMemo(() => {
    return allCROs
      .filter(cro => {
        if (biosecureOnly && !cro.biosecure_compliant) return false;
        if (!biosecureOnly && regions.length > 0 && cro.region && !regions.includes(cro.region)) return false;
        if (glpOnly && !cro.glp_certified) return false;
        if (sizeFilter !== 'any' && cro.size_category !== sizeFilter) return false;
        return true;
      })
      .map(cro => ({ ...cro, score: matchScore(cro, brief?.classification ?? null) }))
      .sort((a, b) => b.score - a.score);
  }, [allCROs, biosecureOnly, glpOnly, regions, sizeFilter, brief]);

  // ── Selection handlers ─────────────────────────────────────────────────────

  function toggleCRO(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredCROs.map(c => c.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  // ── Manual entry handlers ──────────────────────────────────────────────────

  function addManualEntry() {
    setManualEmailError('');
    if (!manualEmail.trim()) { setManualEmailError('Email required'); return; }
    if (!isValidEmail(manualEmail)) { setManualEmailError('Enter a valid email address'); return; }
    if (manualEntries.length >= 20) return;

    const alreadyContacted = sentEmails.has(manualEmail.trim());
    setManualEntries(prev => [
      ...prev,
      { id: clientId(), name: manualName.trim() || manualEmail.trim(), email: manualEmail.trim() },
    ]);
    setManualName('');
    setManualEmail('');
    // Inform but don't block — user may want to resend to the same address
    if (alreadyContacted) {
      setManualEmailError('ℹ An enquiry was already sent to this address — added again for a new send');
    }
  }

  function removeManualEntry(id: string) {
    setManualEntries(prev => prev.filter(e => e.id !== id));
  }

  // ── Proceed ────────────────────────────────────────────────────────────────

  const totalSelected = selectedIds.size + manualEntries.length;

  function handleProceed() {
    if (totalSelected === 0) return;

    // Gather selected CROs
    const selectedCROs = filteredCROs.filter(c => selectedIds.has(c.id));

    // Store selection in sessionStorage for Task 2.2 to pick up
    sessionStorage.setItem(
      `brief_${briefId}_selection`,
      JSON.stringify({
        cros: selectedCROs.map(c => ({
          id: c.id,
          name: c.name,
          email: c.contact_email,
        })),
        manual: manualEntries,
      })
    );

    router.push(`/biotech/briefs/${briefId}/enquiry`);
  }

  // ── Render: loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500 text-sm">
        Brief not found.{' '}
        <a href="/biotech/briefs" className="ml-2 text-blue-400 hover:underline">Back to briefs</a>
      </div>
    );
  }

  const isEmptyDB = allCROs.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-8">

        {/* ── Header ── */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-500">
            <a href="/biotech/briefs" className="hover:text-gray-700 transition-colors">Briefs</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-700">{brief.title ?? 'Untitled brief'}</span>
          </nav>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{brief.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {brief.classification && (
                  <span className="text-xs rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-0.5 uppercase tracking-wide font-medium">
                    {brief.classification}
                  </span>
                )}
                {brief.extracted_data?.glp_requirement?.value && (
                  <span className="text-xs rounded-full bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-0.5">
                    {brief.extracted_data.glp_requirement.value}
                  </span>
                )}
                {brief.extracted_data?.species_model?.value && (
                  <span className="text-xs text-gray-500">
                    {brief.extracted_data.species_model.value}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`/biotech/briefs/${briefId}/rfp`}
                className="flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 text-xs font-medium transition-colors"
              >
                📄 RFP
              </a>
              <a
                href={`/biotech/briefs/${briefId}/extract`}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Edit brief
              </a>
            </div>
          </div>
        </header>

        {/* ── Step label ── */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">Step 2 — Select CROs to contact</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {isEmptyDB ? (
          /* ══════════════════════════════════════════════════════════════
             EMPTY DATABASE STATE — manual entry
          ══════════════════════════════════════════════════════════════ */
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-5 text-sm text-blue-700">
              <p className="font-medium mb-1">CRO database coming soon</p>
              <p className="text-blue-600">
                Enter CRO names and email addresses manually to proceed.
                The platform will match against a curated CRO database in a future update.
              </p>
            </div>

            {/* Manual entry form */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <h2 className="text-sm font-medium text-gray-700">Add CROs manually</h2>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">CRO name</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="Labcorp, Covance, Charles River…"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Contact email <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={e => { setManualEmail(e.target.value); setManualEmailError(''); }}
                    onKeyDown={e => e.key === 'Enter' && addManualEntry()}
                    placeholder="bd@cro.com"
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
                      manualEmailError && !manualEmailError.startsWith('ℹ')
                        ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                        : 'border-gray-200 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                  />
                  {manualEmailError && (
                    <p className={`mt-1 text-xs ${manualEmailError.startsWith('ℹ') ? 'text-blue-600' : 'text-red-400'}`}>
                      {manualEmailError}
                    </p>
                  )}
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={addManualEntry}
                    disabled={manualEntries.length >= 20}
                    className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Added entries */}
              {manualEntries.length > 0 && (
                <div className="space-y-2">
                  {manualEntries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <svg className="h-3.5 w-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-900 font-medium">{entry.name}</span>
                        <span className="text-gray-500">{entry.email}</span>
                      </div>
                      <button
                        onClick={() => removeManualEntry(entry.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none ml-2"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500">{manualEntries.length} / 20 CROs added</p>
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ══════════════════════════════════════════════════════════════
             CRO DATABASE STATE — filters + cards
          ══════════════════════════════════════════════════════════════ */
          <div className="space-y-5">

            {/* Filter bar */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">

              {/* Row 1: BIOSECURE toggle (prominent) */}
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    role="switch"
                    aria-checked={biosecureOnly}
                    onClick={() => setBiosecureOnly(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white ${
                      biosecureOnly ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${biosecureOnly ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-sm font-medium text-gray-800">
                    BIOSECURE Act compliant
                    <span className="ml-1.5 text-xs text-gray-500 font-normal">US / EU / UK only</span>
                  </span>
                </label>

                {/* GLP toggle — only when brief has GLP requirement */}
                {showGlpToggle && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={glpOnly}
                      onChange={e => setGlpOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 bg-white text-blue-500 focus:ring-blue-500 focus:ring-offset-white"
                    />
                    <span className="text-sm text-gray-700">GLP certified only</span>
                  </label>
                )}

                {/* Size filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Size:</span>
                  {(['any', 'small', 'mid', 'large'] as SizeFilter[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSizeFilter(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
                        sizeFilter === s
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Region checkboxes — only when BIOSECURE is OFF */}
              {!biosecureOnly && (
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-500">Region:</span>
                  {['US', 'EU', 'UK', 'APAC'].map(r => (
                    <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={regions.includes(r)}
                        onChange={e => {
                          setRegions(prev =>
                            e.target.checked ? [...prev, r] : prev.filter(x => x !== r)
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-gray-300 bg-white text-blue-500 focus:ring-blue-500 focus:ring-offset-white"
                      />
                      <span className="text-sm text-gray-700">{r}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {filteredCROs.length} CRO{filteredCROs.length !== 1 ? 's' : ''} match
                {selectedIds.size > 0 && (
                  <span className="ml-2 font-medium text-blue-600">
                    — {selectedIds.size} selected
                  </span>
                )}
              </span>
              <div className="flex gap-3 text-xs">
                <button onClick={selectAll} className="text-blue-600 hover:text-blue-700 transition-colors">
                  Select all filtered
                </button>
                <span className="text-gray-300">·</span>
                <button onClick={clearAll} className="text-gray-500 hover:text-gray-700 transition-colors">
                  Clear all
                </button>
              </div>
            </div>

            {/* CRO cards */}
            {filteredCROs.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                No CROs match the current filters. Try relaxing the BIOSECURE or GLP filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredCROs.map(cro => {
                  const selected    = selectedIds.has(cro.id);
                  const alreadySent = cro.contact_email
                    ? sentEmails.has(cro.contact_email)
                    : false;

                  return (
                    <button
                      key={cro.id}
                      type="button"
                      onClick={() => toggleCRO(cro.id)}
                      className={`text-left rounded-xl border p-4 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Checkbox — always shown */}
                          <div className={`shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                            selected ? 'bg-blue-600 border-blue-500' : 'border-gray-300'
                          }`}>
                            {selected && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="font-medium text-sm text-gray-900 truncate">{cro.name}</span>
                          {/* Info badge — non-blocking, just informational */}
                          {alreadySent && (
                            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600">
                              ℹ contacted
                            </span>
                          )}
                        </div>
                        {/* Match score */}
                        {(cro as any).score > 0 && (
                          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                            (cro as any).score >= 80
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : (cro as any).score >= 40
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-200'
                          }`}>
                            {(cro as any).score}% match
                          </span>
                        )}
                      </div>

                      {/* Location */}
                      {(cro.city || cro.country) && (
                        <p className="text-xs text-gray-500 mb-2">
                          {[cro.city, cro.country].filter(Boolean).join(', ')}
                        </p>
                      )}

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {cro.biosecure_compliant && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-medium">
                            BIOSECURE
                          </span>
                        )}
                        {cro.glp_certified && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 font-medium">
                            GLP
                          </span>
                        )}
                        {cro.size_category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-gray-100 text-gray-500 capitalize">
                            {cro.size_category}
                          </span>
                        )}
                      </div>

                      {/* Specialties */}
                      {cro.specialties?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {cro.specialties.map(s => (
                            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Proceed footer ── */}
        <div className="border-t border-gray-200 pt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            {totalSelected > 0
              ? `${totalSelected} CRO${totalSelected !== 1 ? 's' : ''} selected — next: draft IP-safe capability enquiry`
              : 'Select at least one CRO to proceed'}
          </p>
          <button
            onClick={handleProceed}
            disabled={totalSelected === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white
              bg-blue-600 hover:bg-blue-500 text-white
              disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Proceed to outreach →
          </button>
        </div>

      </div>
    </div>
  );
}

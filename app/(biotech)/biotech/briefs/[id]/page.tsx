'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import type { ExtractedData } from '@biotech/prompts/extract-brief';

// ── Constants ──────────────────────────────────────────────────────────────────

const SERVICE_FLAGS = [
  { key: 'in_vitro',       label: 'In Vitro',       confidenceKey: 'in_vitro_confidence_score' },
  { key: 'in_vivo',        label: 'In Vivo',         confidenceKey: 'in_vivo_confidence_score' },
  { key: 'toxicology',     label: 'Toxicology',      confidenceKey: 'toxicology_confidence_score' },
  { key: 'dmpk_adme',      label: 'DMPK / ADME',     confidenceKey: 'dmpk_adme_confidence_score' },
  { key: 'bioanalysis',    label: 'Bioanalysis',     confidenceKey: 'bioanalysis_confidence_score' },
  { key: 'clinical',       label: 'Clinical',        confidenceKey: 'clinical_confidence_score' },
  { key: 'regulatory',     label: 'Regulatory',      confidenceKey: 'regulatory_confidence_score' },
  { key: 'biostatistics',  label: 'Biostatistics',   confidenceKey: 'biostatistics_confidence_score' },
  { key: 'genomics',       label: 'Genomics',        confidenceKey: 'genomics_confidence_score' },
  { key: 'cell_gene',      label: 'Cell & Gene',     confidenceKey: 'cell_gene_confidence_score' },
  { key: 'imaging',        label: 'Imaging',         confidenceKey: 'imaging_confidence_score' },
  { key: 'cmc',            label: 'CMC',             confidenceKey: 'cmc_confidence_score' },
  { key: 'biomarkers',     label: 'Biomarkers',      confidenceKey: 'biomarkers_confidence_score' },
  { key: 'organoids',      label: 'Organoids',       confidenceKey: 'organoids_confidence_score' },
] as const;

type ServiceKey = typeof SERVICE_FLAGS[number]['key'];

// Map brief classification → primary service flag(s)
const CLASSIFICATION_TO_SERVICES: Record<string, ServiceKey[]> = {
  tox:         ['toxicology'],
  pk:          ['dmpk_adme'],
  in_vitro:    ['in_vitro'],
  efficacy:    ['in_vivo'],
  combination: ['in_vitro', 'in_vivo'],
};

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
  state: string | null;
  country: string | null;
  region: string | null;
  biosecure_compliant: boolean;
  specialties: string[] | null;
  size_category: string | null;
  glp_certified: boolean;
  contact_email: string | null;
  contact_form_url: string | null;
  bd_key_contact: string | null;
  services_summary: string | null;
  services_full: string | null;
  employee_count: string | null;
  notable_clients: string | null;
  revenue_estimate: string | null;
  phase_expertise: string | null;
  therapeutic_areas: string | null;
  reputation_positive: string | null;
  website: string | null;
  address: string | null;
  phone: string | null;
  entity_type: string | null;
  small_molecule: boolean | null;
  biologic: boolean | null;
  // service flags
  in_vitro: boolean | null;
  in_vivo: boolean | null;
  toxicology: boolean | null;
  dmpk_adme: boolean | null;
  bioanalysis: boolean | null;
  clinical: boolean | null;
  regulatory: boolean | null;
  biostatistics: boolean | null;
  genomics: boolean | null;
  cell_gene: boolean | null;
  imaging: boolean | null;
  cmc: boolean | null;
  biomarkers: boolean | null;
  organoids: boolean | null;
  // confidence scores
  in_vitro_confidence_score: number | null;
  in_vivo_confidence_score: number | null;
  toxicology_confidence_score: number | null;
  dmpk_adme_confidence_score: number | null;
  bioanalysis_confidence_score: number | null;
  clinical_confidence_score: number | null;
  regulatory_confidence_score: number | null;
  biostatistics_confidence_score: number | null;
  genomics_confidence_score: number | null;
  cell_gene_confidence_score: number | null;
  imaging_confidence_score: number | null;
  cmc_confidence_score: number | null;
  biomarkers_confidence_score: number | null;
  organoids_confidence_score: number | null;
}

interface CROWithScore extends CRO {
  score: number;
  matchedServices: ServiceKey[];
}

interface ManualEntry {
  id: string;
  name: string;
  email: string;
}

type SizeFilter = 'any' | 'Small' | 'Medium' | 'Large';

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeMatch(cro: CRO, classification: string | null): { score: number; matchedServices: ServiceKey[] } {
  const primaryServices = classification ? (CLASSIFICATION_TO_SERVICES[classification.toLowerCase()] ?? []) : [];

  if (primaryServices.length === 0) {
    // No classification — score based on total active services
    const active = SERVICE_FLAGS.filter(f => cro[f.key]);
    return { score: 0, matchedServices: active.map(f => f.key) };
  }

  // Score = average confidence score across matched primary services (0–100)
  let total = 0;
  const matched: ServiceKey[] = [];
  for (const svc of primaryServices) {
    if (cro[svc]) {
      matched.push(svc);
      const conf = (cro as unknown as Record<string, unknown>)[`${svc}_confidence_score`] as number | null;
      total += conf ?? 50; // default 50 if flag is true but no score
    }
  }
  const score = matched.length > 0 ? Math.round(total / primaryServices.length) : 0;
  return { score, matchedServices: matched };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function clientId(): string {
  return Math.random().toString(36).slice(2);
}

// Generic IP-safe contact form copy text
function buildContactFormText(croName: string, classification: string | null): string {
  const serviceHint = classification
    ? `${classification.replace(/_/g, ' ')} studies`
    : 'preclinical studies';
  return `Hi,

I'm reaching out to learn more about your capabilities for ${serviceHint}. We're evaluating CRO partners for an upcoming programme and would appreciate understanding your experience, capacity, and typical timelines.

Could you share details on your relevant capabilities and the best contact for a follow-up discussion?

Thank you`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BriefPage() {
  const router  = useRouter();
  const params  = useParams();
  const briefId = params.id as string;

  // Data
  const [brief, setBrief]       = useState<Brief | null>(null);
  const [allCROs, setAllCROs]   = useState<CRO[]>([]);
  const [sentEmails, setSentEmails] = useState<Set<string>>(new Set());
  const [comparableCount, setComparableCount] = useState(0);
  const [loading, setLoading]   = useState(true);

  // Filters
  const [biosecureOnly, setBiosecureOnly]     = useState(true);
  const [glpOnly, setGlpOnly]                 = useState(false);
  const [regions, setRegions]                 = useState<string[]>(['US', 'EU', 'UK']);
  const [sizeFilter, setSizeFilter]           = useState<SizeFilter>('any');
  const [stateFilter, setStateFilter]         = useState<string>('any');
  const [serviceFilters, setServiceFilters]   = useState<Set<ServiceKey>>(new Set());
  const [showServiceFilters, setShowServiceFilters] = useState(false);
  const [nameFilter, setNameFilter]           = useState('');
  const [modalityFilter, setModalityFilter]   = useState<'any' | 'small_molecule' | 'biologic'>('any');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // No-email CRO handling
  const [emailOverrides, setEmailOverrides]   = useState<Record<string, string>>({});
  const [contactFormCroId, setContactFormCroId] = useState<string | null>(null);
  const [copied, setCopied]                   = useState(false);

  // Manual entry
  const [manualEntries, setManualEntries]     = useState<ManualEntry[]>([]);
  const [manualName, setManualName]           = useState('');
  const [manualEmail, setManualEmail]         = useState('');
  const [manualEmailError, setManualEmailError] = useState('');

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const serviceColumns = SERVICE_FLAGS.flatMap(f => [f.key, f.confidenceKey]).join(', ');

      const [{ data: briefData }, { data: croData }, { data: engData }] = await Promise.all([
        supabase
          .from('rfp_internal_briefs')
          .select('id, title, classification, extracted_data')
          .eq('id', briefId)
          .single(),
        supabase
          .from('cros_directory')
          .select(`id, name, city, state, country, region, biosecure_compliant, specialties,
                   size_category, glp_certified, contact_email, contact_form_url, bd_key_contact,
                   services_summary, services_full, employee_count, notable_clients, revenue_estimate,
                   phase_expertise, therapeutic_areas, reputation_positive, website, address, phone,
                   entity_type, small_molecule, biologic, ${serviceColumns}`)
          .order('name')
          .range(0, 1999),
        supabase
          .from('cro_engagements')
          .select('cro_email, stage')
          .eq('brief_id', briefId)
          .in('stage', ['enquiry_sent', 'response_received', 'followup_draft',
                        'followup_sent', 'meeting_scheduled', 'meeting_done',
                        'rfp_draft', 'rfp_sent', 'quote_received', 'awarded']),
      ]);

      if (briefData) setBrief(briefData as Brief);
      if (croData)   setAllCROs(croData as unknown as CRO[]);
      if (engData) {
        setSentEmails(new Set(engData.map(e => e.cro_email)));
        setComparableCount(engData.filter(e => ['rfp_sent', 'quote_received'].includes(e.stage)).length);
      }
      setLoading(false);
    }
    load();
  }, [briefId]);

  // ── GLP toggle visibility ───────────────────────────────────────────────────

  const showGlpToggle = useMemo(() => {
    const glp = brief?.extracted_data?.glp_requirement;
    return glp && glp.tag !== 'MISSING' && glp.value !== null;
  }, [brief]);

  // ── Filtered + scored CROs ─────────────────────────────────────────────────

  const { filteredWithEmail, filteredNoEmail } = useMemo(() => {
    const nameLower = nameFilter.trim().toLowerCase();
    const scored: CROWithScore[] = allCROs
      .filter(cro => {
        if (nameLower && !cro.name.toLowerCase().includes(nameLower)) return false;
        if (biosecureOnly && !cro.biosecure_compliant) return false;
        if (!biosecureOnly && regions.length > 0 && cro.region && !regions.includes(cro.region)) return false;
        if (glpOnly && !cro.glp_certified) return false;
        if (sizeFilter !== 'any' && cro.size_category !== sizeFilter) return false;
        if (stateFilter !== 'any' && cro.state !== stateFilter) return false;
        if (serviceFilters.size > 0) {
          const croRec = cro as unknown as Record<string, unknown>;
          const hasAll = Array.from(serviceFilters).every(svc => croRec[svc]);
          if (!hasAll) return false;
        }
        if (modalityFilter !== 'any') {
          const croRec = cro as unknown as Record<string, unknown>;
          if (!croRec[modalityFilter]) return false;
        }
        return true;
      })
      .map(cro => {
        const { score, matchedServices } = computeMatch(cro, brief?.classification ?? null);
        return { ...cro, score, matchedServices };
      })
      .sort((a, b) => b.score - a.score);

    return {
      filteredWithEmail: scored.filter(c => c.contact_email),
      filteredNoEmail:   scored.filter(c => !c.contact_email),
    };
  }, [allCROs, biosecureOnly, glpOnly, regions, sizeFilter, stateFilter, serviceFilters, modalityFilter, nameFilter, brief]);

  // Unique US states from filtered results (for state dropdown)
  const availableStates = useMemo(() => {
    const states = allCROs
      .filter(c => c.region === 'US' && c.state)
      .map(c => c.state as string);
    return Array.from(new Set(states)).sort();
  }, [allCROs]);

  const allFiltered = [...filteredWithEmail, ...filteredNoEmail];

  // ── Handlers ────────────────────────────────────────────────────────────────

  function toggleCRO(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(allFiltered.map(c => c.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  function toggleServiceFilter(key: ServiceKey) {
    setServiceFilters(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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
    if (alreadyContacted) {
      setManualEmailError('ℹ An enquiry was already sent to this address — added again for a new send');
    }
  }

  function removeManualEntry(id: string) {
    setManualEntries(prev => prev.filter(e => e.id !== id));
  }

  async function handleCopyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Proceed ────────────────────────────────────────────────────────────────

  const selectedWithEmail  = filteredWithEmail.filter(c => selectedIds.has(c.id));
  const selectedNoEmail    = filteredNoEmail.filter(c => selectedIds.has(c.id));
  // No-email CROs only count toward total if they have an email override
  const selectedNoEmailWithOverride = selectedNoEmail.filter(c => emailOverrides[c.id]?.trim());
  const selectedNoEmailWithForm = selectedNoEmail.filter(c => !emailOverrides[c.id]?.trim() && c.contact_form_url);
  const totalSelected = selectedWithEmail.length + selectedNoEmailWithOverride.length + selectedNoEmailWithForm.length + manualEntries.length;
  const noEmailSelectedCount = selectedNoEmail.length - selectedNoEmailWithOverride.length;

  function handleProceed() {
    if (totalSelected === 0) return;

    const croList = [
      ...selectedWithEmail.map(c => ({ id: c.id, name: c.name, email: c.contact_email, contact_form_url: c.contact_form_url ?? null })),
      ...selectedNoEmailWithOverride.map(c => ({
        id: c.id, name: c.name, email: emailOverrides[c.id].trim(), contact_form_url: c.contact_form_url ?? null,
      })),
      // No-email CROs without an override — include for contact form tab
      ...selectedNoEmail.filter(c => !emailOverrides[c.id]?.trim()).map(c => ({
        id: c.id, name: c.name, email: null, contact_form_url: c.contact_form_url ?? null,
      })),
    ];

    sessionStorage.setItem(
      `brief_${briefId}_selection`,
      JSON.stringify({ cros: croList, manual: manualEntries })
    );

    router.push(`/biotech/briefs/${briefId}/enquiry`);
  }

  // ── Loading ────────────────────────────────────────────────────────────────

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
        <a href="/biotech/briefs" className="ml-2 text-blue-600 hover:underline">Back to briefs</a>
      </div>
    );
  }

  const isEmptyDB = allCROs.length === 0;
  const contactFormCro = contactFormCroId ? allCROs.find(c => c.id === contactFormCroId) ?? null : null;

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
              {comparableCount >= 1 && (
                <a
                  href={`/biotech/briefs/${briefId}/compare`}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  ⚖️ Compare bids ({comparableCount})
                </a>
              )}
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
             EMPTY DATABASE — manual entry only
          ══════════════════════════════════════════════════════════════ */
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-5 text-sm text-blue-700">
              <p className="font-medium mb-1">CRO database coming soon</p>
              <p className="text-blue-600">Enter CRO names and email addresses manually to proceed.</p>
            </div>
            <ManualEntryForm
              entries={manualEntries}
              name={manualName}
              email={manualEmail}
              error={manualEmailError}
              onNameChange={setManualName}
              onEmailChange={v => { setManualEmail(v); setManualEmailError(''); }}
              onAdd={addManualEntry}
              onRemove={removeManualEntry}
            />
          </div>

        ) : (

          /* ══════════════════════════════════════════════════════════════
             CRO DATABASE — filters + cards
          ══════════════════════════════════════════════════════════════ */
          <div className="space-y-5">

            {/* ── Filter bar ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">

              {/* Row 1: BIOSECURE + GLP + Size */}
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
                    BIOSECURE compliant
                    <span className="ml-1.5 text-xs text-gray-500 font-normal">US / EU / UK only</span>
                  </span>
                </label>

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

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Size:</span>
                  {(['any', 'Small', 'Medium', 'Large'] as SizeFilter[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSizeFilter(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        sizeFilter === s
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {s === 'any' ? 'Any' : s}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Modality:</span>
                  {([
                    { value: 'any', label: 'Any' },
                    { value: 'small_molecule', label: 'Small Molecule' },
                    { value: 'biologic', label: 'Biologic' },
                  ] as { value: 'any' | 'small_molecule' | 'biologic'; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setModalityFilter(opt.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        modalityFilter === opt.value
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Region — only when BIOSECURE is OFF */}
              {!biosecureOnly && (
                <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Region:</span>
                  {['US', 'EU', 'UK', 'APAC'].map(r => (
                    <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={regions.includes(r)}
                        onChange={e => setRegions(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                        className="h-3.5 w-3.5 rounded border-gray-300 bg-white text-blue-500 focus:ring-blue-500 focus:ring-offset-white"
                      />
                      <span className="text-sm text-gray-700">{r}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Row 3: US State filter — multi-select chips */}
              {availableStates.length > 0 && (biosecureOnly || regions.includes('US')) && (
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">State:</span>
                    {stateFilter !== 'any' && (
                      <button onClick={() => setStateFilter('any')} className="text-xs text-gray-500 hover:text-gray-600 transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setStateFilter('any')}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        stateFilter === 'any'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      All
                    </button>
                    {availableStates.map(s => (
                      <button
                        key={s}
                        onClick={() => setStateFilter(prev => prev === s ? 'any' : s)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          stateFilter === s
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-gray-200 text-gray-500 hover:border-gray-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Row 3: Service type filters — collapsible */}
              <div className="pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowServiceFilters(v => !v)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg className={`h-3.5 w-3.5 transition-transform ${showServiceFilters ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                  Service type filters
                  {serviceFilters.size > 0 && (
                    <span className="ml-1 rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-semibold">
                      {serviceFilters.size} active
                    </span>
                  )}
                </button>

                {showServiceFilters && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500">Show only CROs that offer ALL selected services:</p>
                    <div className="flex flex-wrap gap-2">
                      {SERVICE_FLAGS.map(({ key, label }) => {
                        const active = serviceFilters.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleServiceFilter(key)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              active
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {serviceFilters.size > 0 && (
                      <button
                        onClick={() => setServiceFilters(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-600 transition-colors"
                      >
                        Clear service filters
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Search + selection controls ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={nameFilter}
                    onChange={e => setNameFilter(e.target.value)}
                    placeholder="Filter by company name…"
                    className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {nameFilter && (
                    <button
                      onClick={() => setNameFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>
                {totalSelected > 0 && (
                  <button
                    onClick={handleProceed}
                    className="shrink-0 px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  >
                    Proceed to outreach ({totalSelected}) →
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {allFiltered.length} CRO{allFiltered.length !== 1 ? 's' : ''} match
                  {selectedIds.size > 0 && (
                    <span className="ml-2 font-medium text-blue-600">— {selectedIds.size} selected</span>
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
            </div>

            {/* ── CRO cards — with email ── */}
            {filteredWithEmail.length === 0 && filteredNoEmail.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                No CROs match the current filters. Try relaxing some filters.
              </div>
            ) : (
              <>
                {filteredWithEmail.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredWithEmail.map(cro => (
                      <CROCard
                        key={cro.id}
                        cro={cro}
                        selected={selectedIds.has(cro.id)}
                        alreadySent={sentEmails.has(cro.contact_email ?? '')}
                        onToggle={() => toggleCRO(cro.id)}
                      />
                    ))}
                  </div>
                )}

                {/* ── No-email CROs section ── */}
                {filteredNoEmail.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 pt-2">
                      <div className="h-px flex-1 bg-amber-100" />
                      <span className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        {filteredNoEmail.length} CRO{filteredNoEmail.length !== 1 ? 's' : ''} — no email address on file
                      </span>
                      <div className="h-px flex-1 bg-amber-100" />
                    </div>
                    <p className="text-xs text-amber-600 text-center">
                      Select any to include them — you can add an email address or use their contact form.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredNoEmail.map(cro => (
                        <div key={cro.id} className="space-y-2">
                          <CROCard
                            cro={cro}
                            selected={selectedIds.has(cro.id)}
                            alreadySent={false}
                            noEmail
                            onToggle={() => toggleCRO(cro.id)}
                          />

                          {/* Email override + contact form — shown when selected */}
                          {selectedIds.has(cro.id) && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                              <p className="text-xs text-amber-700 font-medium">Choose how to contact {cro.name}:</p>

                              {/* Option A: enter email */}
                              <div className="flex gap-2">
                                <input
                                  type="email"
                                  value={emailOverrides[cro.id] ?? ''}
                                  onChange={e => setEmailOverrides(prev => ({ ...prev, [cro.id]: e.target.value }))}
                                  placeholder="Enter email address if known"
                                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              {/* Option B: contact form */}
                              {cro.contact_form_url && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-amber-600">or</span>
                                  <button
                                    onClick={() => setContactFormCroId(cro.id)}
                                    className="text-xs text-blue-600 hover:text-blue-700 underline transition-colors"
                                  >
                                    Copy enquiry text + open contact form →
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Proceed footer ── */}
        <div className="border-t border-gray-200 pt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">
              {totalSelected > 0
                ? `${totalSelected} CRO${totalSelected !== 1 ? 's' : ''} ready to contact`
                : 'Select at least one CRO to proceed'}
            </p>
            {noEmailSelectedCount > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                {noEmailSelectedCount} selected CRO{noEmailSelectedCount !== 1 ? 's have' : ' has'} no email — add an address above or they will be excluded.
              </p>
            )}
          </div>
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

      {/* ── Contact form modal ── */}
      {contactFormCro && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setContactFormCroId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{contactFormCro.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Copy the text below, then open their contact form and paste it in.</p>
              </div>
              <button
                onClick={() => setContactFormCroId(null)}
                className="text-gray-500 hover:text-gray-600 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            <textarea
              readOnly
              rows={8}
              value={buildContactFormText(contactFormCro.name, brief.classification)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none resize-none"
            />

            <div className="flex gap-3">
              <button
                onClick={() => handleCopyText(buildContactFormText(contactFormCro.name, brief.classification))}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {copied ? '✓ Copied!' : 'Copy text'}
              </button>
              {contactFormCro.contact_form_url && (
                <a
                  href={contactFormCro.contact_form_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white text-center hover:bg-blue-500 transition-colors"
                >
                  Open contact form →
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CROCard({
  cro,
  selected,
  alreadySent,
  noEmail = false,
  onToggle,
}: {
  cro: CROWithScore;
  selected: boolean;
  alreadySent: boolean;
  noEmail?: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  const location = [cro.city, cro.state, cro.country].filter(Boolean).join(', ');

  // All active service flags
  const activeServices = SERVICE_FLAGS.filter(f => (cro as unknown as Record<string, unknown>)[f.key]);

  return (
    <div className={`rounded-xl border transition-all ${
      selected
        ? 'border-blue-500 bg-blue-50'
        : noEmail
        ? 'border-orange-200 bg-white'
        : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      {/* ── Card header (always visible, click to select) ── */}
      <button
        type="button"
        onClick={onToggle}
        className="text-left w-full p-4 focus:outline-none"
      >
        {/* Row 1: checkbox + name + match score */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
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
            {alreadySent && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600">
                ℹ contacted
              </span>
            )}
            {noEmail && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-600">
                no email
              </span>
            )}
          </div>
          {cro.score > 0 && (
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
              cro.score >= 75
                ? 'bg-green-50 text-green-700 border border-green-200'
                : cro.score >= 40
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}>
              {cro.score}% match
            </span>
          )}
        </div>

        {/* Location */}
        {location && (
          <p className="text-xs text-gray-500 mb-2">
            {location}
            {cro.employee_count && <span className="ml-2 text-gray-500">· {cro.employee_count} employees</span>}
          </p>
        )}

        {/* Services summary */}
        {cro.services_summary && (
          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{cro.services_summary}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {cro.biosecure_compliant && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-medium">BIOSECURE</span>
          )}
          {cro.glp_certified && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 font-medium">GLP</span>
          )}
          {cro.size_category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-gray-100 text-gray-500">{cro.size_category}</span>
          )}
        </div>

        {/* Matched services */}
        {cro.matchedServices.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cro.matchedServices.map(svc => {
              const label = SERVICE_FLAGS.find(f => f.key === svc)?.label ?? svc;
              return (
                <span key={svc} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                  ✓ {label}
                </span>
              );
            })}
          </div>
        )}
      </button>

      {/* ── Expand toggle ── */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
        className="w-full flex items-center justify-center gap-1 py-1.5 border-t border-gray-100 text-[11px] text-gray-500 hover:text-gray-600 hover:bg-gray-50 transition-colors rounded-b-xl"
      >
        <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
        {expanded ? 'Less detail' : 'More detail'}
      </button>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3 text-xs text-gray-700">

          {/* Services full */}
          {cro.services_full && (
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Full service description</p>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{cro.services_full}</p>
            </div>
          )}

          {/* All service flags */}
          {activeServices.length > 0 && (
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">Services offered</p>
              <div className="flex flex-wrap gap-1.5">
                {activeServices.map(f => (
                  <span key={f.key} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Grid of detail fields */}
          <div className="grid grid-cols-1 gap-2">
            {cro.therapeutic_areas && <DetailRow label="Therapeutic areas" value={cro.therapeutic_areas} />}
            {cro.phase_expertise    && <DetailRow label="Phase expertise"   value={cro.phase_expertise} />}
            {cro.notable_clients    && <DetailRow label="Notable clients"   value={cro.notable_clients} />}
            {cro.revenue_estimate   && <DetailRow label="Revenue estimate"  value={cro.revenue_estimate} />}
            {cro.reputation_positive && <DetailRow label="Known for"        value={cro.reputation_positive} />}
            {cro.entity_type        && <DetailRow label="Entity type"       value={cro.entity_type} />}
            {cro.website && (
              <div className="flex gap-2">
                <span className="font-medium text-gray-500 shrink-0 w-32">Website</span>
                <a
                  href={cro.website.startsWith('http') ? cro.website : `https://${cro.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-blue-600 hover:underline truncate"
                >
                  {cro.website}
                </a>
              </div>
            )}
            {cro.address && <DetailRow label="Address" value={cro.address} />}
            {cro.phone   && <DetailRow label="Phone"   value={cro.phone} />}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="font-medium text-gray-500 shrink-0 w-32">{label}</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

function ManualEntryForm({
  entries, name, email, error,
  onNameChange, onEmailChange, onAdd, onRemove,
}: {
  entries: ManualEntry[];
  name: string; email: string; error: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <h2 className="text-sm font-medium text-gray-700">Add CROs manually</h2>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">CRO name</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Labcorp, Charles River…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Contact email <span className="text-red-400">*</span></label>
          <input
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAdd()}
            placeholder="bd@cro.com"
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
              error && !error.startsWith('ℹ')
                ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                : 'border-gray-200 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
          {error && (
            <p className={`mt-1 text-xs ${error.startsWith('ℹ') ? 'text-blue-600' : 'text-red-500'}`}>{error}</p>
          )}
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onAdd}
            disabled={entries.length >= 20}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 font-medium transition-colors disabled:opacity-40"
          >
            + Add
          </button>
        </div>
      </div>
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <svg className="h-3.5 w-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-900 font-medium">{entry.name}</span>
                <span className="text-gray-500">{entry.email}</span>
              </div>
              <button onClick={() => onRemove(entry.id)} className="text-gray-500 hover:text-red-500 transition-colors text-lg leading-none ml-2">×</button>
            </div>
          ))}
          <p className="text-xs text-gray-500">{entries.length} / 20 CROs added</p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import TagSelect from '@cro/components/TagSelect';
import TeamMemberBlock from '@cro/components/TeamMemberBlock';
import type { CROProfile, TeamMember } from '@cro/types';
import { computeProfileScore } from '@cro/lib/profile-score';
import Tooltip from '@shared/components/Tooltip';
import LogoUpload from '@cro/components/LogoUpload';
import AutofillModal, { type AutofillResult } from '@cro/components/AutofillModal';
import AutofillReviewModal, { type AppliedFields } from '@cro/components/AutofillReviewModal';

const THERAPEUTIC_AREAS = [
  'Oncology',
  'CNS',
  'Cardiovascular',
  'Infectious Disease',
  'Rare Disease',
  'Immunology',
  'Other',
];

const ASSAY_TYPES = [
  'In vitro tox',
  'DMPK/PK',
  'Safety pharmacology',
  'In vivo efficacy',
  'Organoid studies',
  'Bioanalysis',
  'Histopathology',
  'Other',
];

const ACCREDITATIONS = ['GLP', 'AAALAC', 'ISO 17025', 'CAP', 'Other'];

const EMPTY_MEMBER: TeamMember = {
  name: '',
  title: '',
  years_experience: 0,
  expertise: '',
};

interface ProfileFormProps {
  initialData: CROProfile | null;
  initialLogoUrl?: string | null;
}

function wordCount(text: string) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

export default function ProfileForm({ initialData, initialLogoUrl }: ProfileFormProps) {
  const [companyName, setCompanyName] = useState(initialData?.company_name ?? '');
  const [companyOverview, setCompanyOverview] = useState(
    initialData?.company_overview ?? ''
  );
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>(
    initialData?.therapeutic_areas ?? []
  );
  const [assayTypes, setAssayTypes] = useState<string[]>(
    initialData?.assay_types ?? []
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(
    Array.isArray(initialData?.team_members) && initialData.team_members.length > 0
      ? (initialData.team_members as TeamMember[])
      : [{ ...EMPTY_MEMBER }]
  );
  const [facilityDescription, setFacilityDescription] = useState(
    initialData?.facility_description ?? ''
  );
  const [accreditations, setAccreditations] = useState<string[]>(
    initialData?.accreditations ?? []
  );
  const [geographicReach, setGeographicReach] = useState(
    initialData?.geographic_reach ?? ''
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [nameError, setNameError] = useState('');

  // Auto-fill state
  const [showAutofill, setShowAutofill] = useState(false);
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  function handleAutofillResult(result: AutofillResult) {
    setAutofillResult(result);
    setShowAutofill(false);
  }

  function handleApplyFields(fields: AppliedFields) {
    const newHighlighted = new Set<string>();
    if (fields.company_name != null) { setCompanyName(fields.company_name); newHighlighted.add('company_name'); }
    if (fields.company_overview != null) { setCompanyOverview(fields.company_overview); newHighlighted.add('company_overview'); }
    if (fields.therapeutic_areas != null) { setTherapeuticAreas(fields.therapeutic_areas); newHighlighted.add('therapeutic_areas'); }
    if (fields.assay_types != null) { setAssayTypes(fields.assay_types); newHighlighted.add('assay_types'); }
    if (fields.team_members != null) { setTeamMembers(fields.team_members); newHighlighted.add('team_members'); }
    if (fields.facility_description != null) { setFacilityDescription(fields.facility_description); newHighlighted.add('facility_description'); }
    if (fields.accreditations != null) { setAccreditations(fields.accreditations); newHighlighted.add('accreditations'); }
    if (fields.geographic_reach != null) { setGeographicReach(fields.geographic_reach); newHighlighted.add('geographic_reach'); }
    setHighlighted(newHighlighted);
    setAutofillResult(null);
    // Clear highlights after 4 seconds
    setTimeout(() => setHighlighted(new Set()), 4000);
  }

  function hl(field: string) {
    return highlighted.has(field)
      ? 'ring-2 ring-amber-400 bg-amber-50 transition-all duration-500'
      : '';
  }

  function toggleAccreditation(acc: string) {
    setAccreditations((prev) =>
      prev.includes(acc) ? prev.filter((a) => a !== acc) : [...prev, acc]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setNameError('');

    if (!companyName.trim()) {
      setNameError('Company name is required.');
      return;
    }

    setSaving(true);

    const payload: Partial<CROProfile> = {
      company_name: companyName.trim(),
      company_overview: companyOverview.trim(),
      therapeutic_areas: therapeuticAreas,
      assay_types: assayTypes,
      team_members: teamMembers.filter((m) => m.name.trim() !== ''),
      facility_description: facilityDescription.trim(),
      accreditations,
      geographic_reach: geographicReach.trim(),
    };

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }

      setSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  const overviewWords = wordCount(companyOverview);

  const { score, items: scoreItems } = computeProfileScore({
    company_name: companyName,
    company_overview: companyOverview,
    therapeutic_areas: therapeuticAreas,
    assay_types: assayTypes,
    team_members: teamMembers,
    facility_description: facilityDescription,
    accreditations,
    geographic_reach: geographicReach,
  });
  const missingItems = scoreItems.filter(i => !i.earned);

  return (
    <>
      {showAutofill && (
        <AutofillModal
          onClose={() => setShowAutofill(false)}
          onResult={handleAutofillResult}
        />
      )}
      {autofillResult && (
        <AutofillReviewModal
          result={autofillResult}
          current={{
            company_name: companyName,
            company_overview: companyOverview,
            therapeutic_areas: therapeuticAreas,
            assay_types: assayTypes,
            team_members: teamMembers,
            facility_description: facilityDescription,
            accreditations,
            geographic_reach: geographicReach,
          }}
          onClose={() => setAutofillResult(null)}
          onApply={handleApplyFields}
        />
      )}
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-10">

      {/* Profile completeness */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Profile completeness</h3>
          <span className={`text-sm font-bold ${
            score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-500'
          }`}>
            {score} / 100
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        {score < 80 && missingItems.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Complete these to reach 80+:</p>
            <ul className="flex flex-col gap-1">
              {missingItems.map(item => (
                <li key={item.label} className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  <a
                    href={`#${item.anchor}`}
                    className="text-xs text-gray-600 hover:text-green-700 hover:underline"
                  >
                    {item.label}
                    <span className="ml-1 text-gray-400">(+{item.points} pts)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {score >= 80 && (
          <p className="text-xs text-green-600 font-medium">
            Great profile — your proposals will be well-tailored.
          </p>
        )}
      </section>

      {/* Auto-fill button */}
      <div className="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Auto-fill from documents</p>
          <p className="text-xs text-gray-500 mt-0.5">Upload a capability statement, brochure, or paste website copy — AI fills in the fields for you.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAutofill(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Auto-fill
        </button>
      </div>

      {/* Highlight notice */}
      {highlighted.size > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-3 rounded-xl text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>{highlighted.size} field{highlighted.size !== 1 ? 's' : ''} pre-filled — highlighted below. Review and save when ready.</span>
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 px-5 py-4 rounded-xl">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Profile saved successfully.</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Section 1 — Company basics */}
      <section id="company-basics" className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-3">
          Company basics
        </h3>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <label className="block text-sm font-medium text-gray-700">Company logo</label>
            <Tooltip text="Your logo appears on the cover page and header of every exported PDF and Word proposal." />
          </div>
          <LogoUpload initialLogoUrl={initialLogoUrl ?? null} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              if (nameError) setNameError('');
            }}
            placeholder="Apex Preclinical Research Inc."
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              nameError ? 'border-red-400' : 'border-gray-300'
            } ${hl('company_name')}`}
          />
          {nameError && (
            <p className="text-xs text-red-500 mt-1">{nameError}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <label className="block text-sm font-medium text-gray-700">Company overview</label>
              <Tooltip text="Appears in the Executive Summary of every proposal to position your CRO to the sponsor." />
            </div>
            <span
              className={`text-xs ${
                overviewWords > 220
                  ? 'text-red-500'
                  : overviewWords > 180
                  ? 'text-amber-500'
                  : 'text-gray-400'
              }`}
            >
              {overviewWords} / 200 words suggested
            </span>
          </div>
          <textarea
            rows={5}
            value={companyOverview}
            onChange={(e) => setCompanyOverview(e.target.value)}
            placeholder="Brief description of your CRO — what you do, who you serve, and what makes you different. ~200 words."
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y ${hl('company_overview')}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Geographic reach
          </label>
          <input
            type="text"
            value={geographicReach}
            onChange={(e) => setGeographicReach(e.target.value)}
            placeholder="e.g. North America, EU, global"
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${hl('geographic_reach')}`}
          />
        </div>
      </section>

      {/* Section 2 — Capabilities */}
      <section id="capabilities" className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-3">
          Capabilities
        </h3>

        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <label className="block text-sm font-medium text-gray-700">Therapeutic areas</label>
            <Tooltip text="Helps the AI tailor proposal language to the sponsor's disease area and scientific context." />
          </div>
          <div className={`rounded-lg ${hl('therapeutic_areas')}`}>
            <TagSelect
              options={THERAPEUTIC_AREAS}
              selected={therapeuticAreas}
              onChange={setTherapeuticAreas}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <label className="block text-sm font-medium text-gray-700">Assay types</label>
            <Tooltip text="Used to match saved library sections when generating new proposals — the more you add, the better the matches." />
          </div>
          <div className={`rounded-lg ${hl('assay_types')}`}>
            <TagSelect
              options={ASSAY_TYPES}
              selected={assayTypes}
              onChange={setAssayTypes}
            />
          </div>
        </div>
      </section>

      {/* Section 3 — Facility */}
      <section id="facility" className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-3">
          Facility &amp; compliance
        </h3>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="block text-sm font-medium text-gray-700">Facility description</label>
            <Tooltip text="Written directly into the Facility Overview section of every proposal. Sponsors use this to assess your capabilities before awarding a contract." />
          </div>
          <textarea
            rows={4}
            value={facilityDescription}
            onChange={(e) => setFacilityDescription(e.target.value)}
            placeholder="Describe your facility — size, key instruments, containment levels, unique capabilities."
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y ${hl('facility_description')}`}
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <label className="block text-sm font-medium text-gray-700">Accreditations</label>
            <Tooltip text="GLP, AAALAC and ISO certifications are a top trust signal for biotech sponsors — prominently featured in the Facility Overview." />
          </div>
          <div className={`flex flex-wrap gap-3 rounded-lg p-1 ${hl('accreditations')}`}>
            {ACCREDITATIONS.map((acc) => (
              <label
                key={acc}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={accreditations.includes(acc)}
                  onChange={() => toggleAccreditation(acc)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700 font-medium">{acc}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4 — Team */}
      <section id="team" className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">
        <div className="flex items-center gap-1.5 border-b border-gray-100 pb-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Team members</h3>
          <Tooltip text="Your team members are named by role and expertise in the Team Qualifications section — sponsors want to see real scientists, not generic descriptions." position="right" />
        </div>
        <p className="text-sm text-gray-500 -mt-2">
          Add the key scientists and managers who would work on proposals. Min 1, max 10.
        </p>
        <div className={`rounded-lg ${hl('team_members')}`}>
          <TeamMemberBlock members={teamMembers} onChange={setTeamMembers} />
        </div>
      </section>

      {/* Submit */}
      <div className="flex items-center justify-between pb-10">
        <p className="text-sm text-gray-400">
          <span className="text-red-400">*</span> Required field
        </p>
        <button
          type="submit"
          disabled={saving}
          className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
    </>
  );
}

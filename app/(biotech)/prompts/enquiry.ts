// Prompt for Task 2.2 — IP-Safe Capability Enquiry Generator
//
// CRITICAL IP CONSTRAINT (enforced here at prompt construction):
// The compound_description field (drug class/route) is intentionally excluded
// from safe fields — "compound class" is on the never-include list per Task 2.2.
// Only study type, species, group sizes, GLP, timeline, deliverables, and
// budget (if opted in) are passed to the outbound message.
//
// compound_name / MOA / indication are never in extracted_data at all
// (stripped at extraction time in Task 1.2).

// ── Safe fields passed to CRO outreach ───────────────────────────────────────

export interface SafeFields {
  study_type: string | null;
  assay_types: string | null;
  species_model: string | null;
  group_sizes: string | null;
  primary_endpoints: string | null;
  timeline: string | null;
  glp_requirement: string | null;
  deliverables: string | null;
  budget_range: string | null;       // only included when include_budget = true
  special_requirements: string | null;
}

// ── UI display labels for the IP checklist ────────────────────────────────────

export const SAFE_FIELD_LABELS: Record<keyof SafeFields, string> = {
  study_type:           'Study type',
  assay_types:          'Assay type(s)',
  species_model:        'Species / model',
  group_sizes:          'Group sizes & cohort design',
  primary_endpoints:    'Primary endpoints',
  timeline:             'Timeline requirements',
  glp_requirement:      'GLP / compliance requirement',
  deliverables:         'Key deliverables',
  budget_range:         'Budget range',
  special_requirements: 'Special requirements / constraints',
};

// Fields permanently excluded from outreach regardless of user action
export const ALWAYS_EXCLUDED_LABELS = [
  { label: 'Compound identity & structure' },
  { label: 'Mechanism of action' },
  { label: 'Disease indication / therapeutic area' },
  { label: 'Internal study rationale or strategy' },
  { label: 'Prior study results' },
  { label: 'Drug class / compound class' },
] as const;

// ── Prompt builder ─────────────────────────────────────────────────────────────

export function buildEnquiryPrompt({
  safeFields,
  croName,
  includeBudget,
  deadlineDays,
  senderCompany,
}: {
  safeFields: SafeFields;
  croName: string;
  includeBudget: boolean;
  deadlineDays: number;
  senderCompany?: string | null;
}): string {
  const deadline = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const fieldLines: string[] = [];
  if (safeFields.study_type)           fieldLines.push(`Study type: ${safeFields.study_type}`);
  if (safeFields.assay_types)          fieldLines.push(`Assay type(s): ${safeFields.assay_types}`);
  if (safeFields.species_model)        fieldLines.push(`Species/model: ${safeFields.species_model}`);
  if (safeFields.group_sizes)          fieldLines.push(`Group sizes: ${safeFields.group_sizes}`);
  if (safeFields.primary_endpoints)    fieldLines.push(`Primary endpoints: ${safeFields.primary_endpoints}`);
  if (safeFields.timeline)             fieldLines.push(`Timeline: ${safeFields.timeline}`);
  if (safeFields.glp_requirement)      fieldLines.push(`GLP/compliance: ${safeFields.glp_requirement}`);
  if (safeFields.deliverables)         fieldLines.push(`Key deliverables: ${safeFields.deliverables}`);
  if (includeBudget && safeFields.budget_range)
    fieldLines.push(`Budget range: ${safeFields.budget_range}`);
  if (safeFields.special_requirements) fieldLines.push(`Special requirements: ${safeFields.special_requirements}`);

  const fieldsBlock = fieldLines.length > 0
    ? fieldLines.join('\n')
    : '(Limited information available — keep message brief and general.)';

  const companyLine = senderCompany
    ? `The enquiry is sent on behalf of: ${senderCompany}`
    : 'Sender company name not provided — do not invent one.';

  return `Draft an IP-safe capability enquiry email to a preclinical CRO.

PURPOSE: Determine if this CRO has the capability and capacity to run this study.
This is initial outreach only — NOT the full RFP.

ABSOLUTE IP RULES — never violate these:
1. NEVER mention compound name, chemical structure, CAS number, SMILES, or internal compound ID.
2. NEVER mention mechanism of action, molecular target, or pharmacology.
3. NEVER mention disease indication or therapeutic area.
4. NEVER mention drug class or compound class.
5. NEVER include internal program names, study IDs, or strategic rationale.
6. NEVER include prior study results.
7. Use ONLY the safe fields provided below. Do not embellish or invent.

WHAT TO ASK FOR:
Ask the CRO to confirm: (1) capability for this study type, (2) estimated start availability, (3) indicative budget range, and (4) respond by the deadline.

FORMAT:
- 200–300 words maximum
- Address to: "${croName} team"
- Subject line format: "Preclinical [study type] capability enquiry — [company name]"
- Close with response deadline and offer to provide further information
- Professional, concise — no filler phrases

${companyLine}
CRO: ${croName}
Include budget range in message: ${includeBudget}
Response requested by: ${deadline} (${deadlineDays} days from today)

Safe brief fields:
${fieldsBlock}

Return ONLY a JSON object — no prose, no markdown, no code fences:
{ "subject": "string", "body": "string" }`;
}

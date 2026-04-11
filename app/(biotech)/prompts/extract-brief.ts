// Prompt for Task 1.2 — AI Structured Extraction
// Extracts 12 structured fields from raw user input (text + docs + voice).
//
// CRITICAL IP CONSTRAINT:
// Compound names, chemical structures, mechanisms of action, and disease
// indications must NEVER appear in any extracted field value.
// If present in the input, they are silently omitted.
// Field 4 (compound_description) captures only drug class + route — nothing else.

export const FIELD_KEYS = [
  'study_objective',
  'study_type',
  'assay_types',
  'compound_description',
  'species_model',
  'group_sizes',
  'primary_endpoints',
  'timeline',
  'glp_requirement',
  'deliverables',
  'budget_range',
  'special_requirements',
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldTag = 'STATED' | 'INFERRED' | 'MISSING';

export interface ExtractedField {
  value: string | null;
  tag: FieldTag;
}

export type ExtractedData = Record<FieldKey, ExtractedField> & {
  classification: string;
};

export function buildExtractionPrompt(combinedInput: string): string {
  return `You are extracting structured preclinical study information from a biotech company's private internal brief.

CRITICAL IP RULES — strictly enforced:
1. Do NOT include compound names, chemical structures, SMILES, InChI, CAS numbers, internal compound IDs, mechanisms of action, molecular targets, or disease indications in ANY field.
2. For "compound_description": extract ONLY the drug class (e.g. "small molecule", "biologic", "monoclonal antibody", "siRNA") and route of administration (e.g. "oral", "IV", "subcutaneous"). Nothing else.
3. If you encounter compound names or MOA in the input, silently omit them — do not reference or paraphrase them.

Extract exactly these 12 fields. For each, assign a tag:
- "STATED": explicitly present in the input
- "INFERRED": reasonably deducible from context (explain nothing — just tag it)
- "MISSING": not present and cannot be inferred

Return ONLY a single valid JSON object. No prose, no markdown, no code fences.

JSON schema (all fields required):
{
  "study_objective":    { "value": string | null, "tag": "STATED"|"INFERRED"|"MISSING" },
  "study_type":         { "value": "tox"|"pk"|"efficacy"|"in_vitro"|"combination"|string | null, "tag": "..." },
  "assay_types":        { "value": string | null, "tag": "..." },
  "compound_description": { "value": string | null, "tag": "..." },
  "species_model":      { "value": string | null, "tag": "..." },
  "group_sizes":        { "value": string | null, "tag": "..." },
  "primary_endpoints":  { "value": string | null, "tag": "..." },
  "timeline":           { "value": string | null, "tag": "..." },
  "glp_requirement":    { "value": string | null, "tag": "..." },
  "deliverables":       { "value": string | null, "tag": "..." },
  "budget_range":       { "value": string | null, "tag": "..." },
  "special_requirements": { "value": string | null, "tag": "..." },
  "classification": "tox"|"pk"|"efficacy"|"in_vitro"|"combination"|"other"
}

Additional rules:
- Use null (not "") for MISSING fields
- "classification" is a top-level string — pick the single best-fit category
- Values should be concise: 1–3 sentences maximum per field
- Do not invent content — only extract what is present or clearly inferable

--- INPUT BEGINS ---
${combinedInput}
--- INPUT ENDS ---`;
}

export const FIELD_META: Record<FieldKey, { label: string; hint: string }> = {
  study_objective:      { label: 'Study Objective',           hint: 'What is the purpose of this study?' },
  study_type:           { label: 'Study Type',                hint: 'e.g. tox, PK, efficacy, in vitro, combination' },
  assay_types:          { label: 'Specific Assay Type(s)',    hint: 'Specific assays to be run' },
  compound_description: { label: 'Compound Description',      hint: 'Drug class and route only — no compound name or MOA' },
  species_model:        { label: 'Species / Model',           hint: 'e.g. Sprague-Dawley rat, CD-1 mouse, HepG2 cells' },
  group_sizes:          { label: 'Group Sizes & Cohort Design', hint: 'Number of animals per group, cohort structure' },
  primary_endpoints:    { label: 'Primary Endpoints',         hint: 'What measurements define study success?' },
  timeline:             { label: 'Timeline Requirements',     hint: 'Start date, study duration, report deadline' },
  glp_requirement:      { label: 'GLP / Compliance',          hint: 'GLP, non-GLP, IND-enabling, OECD guideline' },
  deliverables:         { label: 'Key Deliverables',          hint: 'Reports, data packages, raw data, formats' },
  budget_range:         { label: 'Budget Range',              hint: 'Approximate budget or acceptable range' },
  special_requirements: { label: 'Special Requirements',      hint: 'Constraints, prior CRO experience, preferences, exclusions' },
};

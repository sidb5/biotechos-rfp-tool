export const rfpParsePrompt = (rfpText: string): string => `
You are extracting structured data from a preclinical CRO Request for Proposal (RFP).
Read the full RFP text below and return ONLY a valid JSON object — no prose, no markdown, no code fences.

RFP TEXT:
---
${rfpText}
---

Return a JSON object with EXACTLY these fields:

{
  "biotech_name": "Name of the biotech or pharma company issuing the RFP",
  "biotech_email": "Contact email address found in the RFP or request, or null if not present",
  "study_type": "One concise phrase describing the study type (e.g. 'GLP in vitro safety pharmacology panel', 'GLP 28-day rat toxicology', 'in vitro DMPK profiling')",
  "assay_types": ["array", "of", "specific", "assay", "names", "requested"],
  "species": "Species or cell systems used (e.g. 'HEK293, CHO-K1, TK6 cells' for in vitro; 'Sprague-Dawley rat' for in vivo; 'N/A - in vitro only' if no animals)",
  "primary_endpoints": ["array", "of", "primary", "scientific", "endpoints"],
  "secondary_endpoints": ["array", "of", "secondary", "endpoints", "or", "empty", "array", "if", "none"],
  "sample_count": "Describe sample numbers (e.g. 'n=3 per concentration, 5 concentrations per assay' or 'N/A - in vitro' or 'Not specified')",
  "timeline_weeks": "Number of weeks for draft reports (just the number as a string, e.g. '16'), or 'Not specified'",
  "deliverables": ["array", "of", "deliverables", "listed", "in", "the", "RFP"],
  "special_requirements": ["array", "of", "special", "requirements", "constraints", "or", "sponsor", "preferences"],
  "ambiguities": ["array", "of", "things", "that", "are", "unclear", "missing", "or", "need", "clarification", "from", "the", "sponsor"]
}

Rules:
- Extract only what is stated in the RFP — do not invent or assume details not present
- assay_types: list each assay as a concise name (e.g. "hERG patch-clamp", "Ames test", "in vitro micronucleus")
- ambiguities: flag missing information that a CRO would need to price the study (e.g. no quantity of test article specified, no animal group sizes stated, timeline is ambiguous, GLP status unclear)
- If a field has no applicable value, use an empty array [] or "Not specified"
- Return valid JSON only — the response will be parsed directly with JSON.parse()
`;

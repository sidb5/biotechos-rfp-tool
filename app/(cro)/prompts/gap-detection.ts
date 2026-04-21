import type { CROProfile } from '@cro/types';

interface GapDetectionInput {
  rfpText: string;
  parsedRFP: Record<string, unknown>;
  profile: CROProfile;
  knowledgeRepoContent?: string; // injected in Task 5
}

export function gapDetectionPrompt({ rfpText, parsedRFP, profile, knowledgeRepoContent }: GapDetectionInput): string {
  const profileSummary = [
    `Company: ${profile.company_name}`,
    profile.company_overview ? `Overview: ${profile.company_overview}` : null,
    profile.assay_types?.length ? `Assay types: ${profile.assay_types.join(', ')}` : null,
    profile.therapeutic_areas?.length ? `Therapeutic areas: ${profile.therapeutic_areas.join(', ')}` : null,
    profile.accreditations?.length ? `Accreditations: ${profile.accreditations.join(', ')}` : null,
    profile.facility_description ? `Facility: ${profile.facility_description}` : null,
    profile.geographic_reach ? `Geographic reach: ${profile.geographic_reach}` : null,
    profile.team_members?.length
      ? `Team: ${profile.team_members.map(m => `${m.name} (${m.title})`).join('; ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const repoSection = knowledgeRepoContent
    ? `\nCRO KNOWLEDGE REPOSITORY (past proposals, SOPs, capability documents).
Use this content to determine what the CRO already knows.
Only flag a gap if the answer is NOT present in the repository below:

${knowledgeRepoContent}

---\n`
    : '';

  return `You are analyzing an RFP to identify SPECIFIC technical data gaps — values the RFP requires but that the CRO profile and knowledge repository do not contain.

A gap exists when:
- The RFP asks for a SPECIFIC numeric value, metric, or capability confirmation
- AND neither the CRO profile nor the repository contains that specific value
- Categorical capability claims ("we do ELISA") do NOT satisfy specific value requests ("state your ELISA LOD in pg/mL")

Do NOT flag a gap when:
- The CRO profile or repository already answers it with a specific value
- The RFP asks for something entirely outside this CRO's stated capabilities (that's a bid/no-bid issue, not a gap)
- The question is about pricing (always human-filled)

CRO PROFILE:
${profileSummary}
${repoSection}
PARSED RFP REQUIREMENTS:
${JSON.stringify(parsedRFP, null, 2)}

FULL RFP TEXT:
${rfpText}

Return a JSON array of gap objects. If no gaps exist, return an empty array [].
Each gap object must follow this exact schema:
{
  "gap_id": "gap_001",  // sequential, zero-padded
  "rfp_requirement": "exact text of what the RFP asks for",
  "what_we_have": "what the CRO profile or repo contains on this topic",
  "what_is_missing": "the specific value or data that is absent",
  "question_for_sme": "a clear, direct question for the relevant scientist or lab director",
  "question_type": "numeric | text | yes_no | selection",
  "unit_hint": "e.g. pg/mL — only for numeric types, null otherwise",
  "suggested_recipient_role": "e.g. Lab Director, Toxicology Lead",
  "status": "pending"
}

Return ONLY the JSON array. No prose, no markdown fences, no explanation.`;
}

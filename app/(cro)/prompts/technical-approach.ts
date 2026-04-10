import { CROProfile, ParsedRFP } from './index';

export const technicalApproachPrompt = (
  profile: CROProfile,
  rfp: ParsedRFP
): string => `
Write the Technical Approach section of a proposal from ${profile.company_name} 
for a ${rfp.study_type} study.

Study details:
- Assay types required: ${rfp.assay_types.join(', ')}
- Species: ${rfp.species || 'Not specified'}
- Primary endpoints: ${rfp.primary_endpoints.join(', ')}
- Secondary endpoints: ${rfp.secondary_endpoints.join(', ') || 'None stated'}
- Sample count: ${rfp.sample_count || 'To be confirmed'}
- Special requirements: ${rfp.special_requirements.join(', ') || 'None stated'}

CRO capabilities relevant to this study:
- Assay types: ${(profile.assay_types ?? []).join(', ')}
- Facility: ${profile.facility_description ?? 'Not specified'}
- Accreditations: ${(profile.accreditations ?? []).join(', ')}

Write a detailed technical approach covering:
1. Study design rationale — why this design is optimal for the endpoints
2. Methodology for each assay type requested — be specific about instruments, 
   protocols, and standards followed
3. Quality control measures built into the study design
4. How primary and secondary endpoints will be measured and reported
5. Any GLP or regulatory compliance considerations relevant to this study type

Use subheadings for each of the 5 areas above.
Be specific — name assay methodologies, instruments, and standards (e.g. 
ICH S7A for safety pharmacology, OECD guidelines for toxicology).
Maximum 500 words.
`;
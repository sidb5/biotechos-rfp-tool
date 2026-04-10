import { CROProfile, ParsedRFP } from './index';

export const facilityOverviewPrompt = (
  profile: CROProfile,
  rfp: ParsedRFP
): string => `
Write the Facility and Infrastructure Overview section of a proposal from 
${profile.company_name} for a ${rfp.study_type} study.

CRO facility information:
- Facility description: ${profile.facility_description ?? 'Not specified'}
- Accreditations held: ${(profile.accreditations ?? []).join(', ')}
- Geographic location/reach: ${profile.geographic_reach ?? 'Not specified'}

Study requirements that facility must support:
- Study type: ${rfp.study_type}
- Assays required: ${rfp.assay_types.join(', ')}
- Species: ${rfp.species || 'In vitro only'}
- Special requirements: ${rfp.special_requirements.join(', ') || 'Standard'}

Write this section covering:
1. Facility overview — size, layout, relevant capabilities for this study
2. Specific equipment and instruments relevant to the assays requested 
   — be specific with instrument names where possible
3. Compliance and accreditation status — how the facility meets regulatory 
   requirements for this study type
4. Any biosafety levels, containment capabilities, or special infrastructure 
   relevant to this specific RFP

Use subheadings. Be concrete — avoid vague phrases like "state of the art" 
or "cutting edge". Name actual instruments and standards.
Maximum 350 words.
`;
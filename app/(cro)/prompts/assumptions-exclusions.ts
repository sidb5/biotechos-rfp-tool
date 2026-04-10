import { CROProfile, ParsedRFP } from './index';

export const assumptionsExclusionsPrompt = (
  profile: CROProfile,
  rfp: ParsedRFP
): string => `
Write the Assumptions and Exclusions section of a proposal from 
${profile.company_name} for a ${rfp.study_type} study.

This is a critical section. It protects the CRO from scope creep by clearly 
stating what the proposal assumes and what is not included.

Known ambiguities in this RFP that need addressing:
${rfp.ambiguities.length > 0 
  ? rfp.ambiguities.map(a => `- ${a}`).join('\n')
  : '- No specific ambiguities flagged — generate standard assumptions for this study type'
}

Study type: ${rfp.study_type}
Assays: ${rfp.assay_types.join(', ')}
Species: ${rfp.species || 'In vitro'}

Generate two subsections:

ASSUMPTIONS (what this proposal is priced based on):
List 6–10 specific assumptions relevant to this study type. Examples:
- Test article provided by sponsor in [format] at [purity]
- Number of dose groups assumed as [X] unless otherwise specified
- Statistical analysis limited to [methods] unless additional requested
- Report format follows [standard] unless sponsor template provided
- [Any species/sample count assumptions based on RFP]
Make each assumption specific to THIS study type — not generic boilerplate.

EXCLUSIONS (what is NOT included in this proposal):
List 4–6 clear exclusions. Examples:
- Regulatory submission filing fees
- Additional dose groups beyond those specified
- Repeat studies due to test article failure
- Storage of samples beyond [X] months post-study
- Travel costs for sponsor visits beyond [X] visits

Format as two bulleted lists under clear subheadings.
Maximum 350 words.
`;
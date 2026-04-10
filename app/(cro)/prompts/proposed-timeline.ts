import { CROProfile, ParsedRFP } from './index';

export const proposedTimelinePrompt = (
  profile: CROProfile,
  rfp: ParsedRFP
): string => `
Write the Proposed Timeline section of a proposal from ${profile.company_name} 
for a ${rfp.study_type} study.

Study parameters:
- Study type: ${rfp.study_type}
- Assays: ${rfp.assay_types.join(', ')}
- Sample count: ${rfp.sample_count || 'TBD'}
- Requested timeline: ${rfp.timeline_weeks || 'Not specified'} weeks
- Deliverables expected: ${rfp.deliverables.join(', ')}

Write a timeline section that includes:
1. A brief narrative paragraph explaining the overall timeline logic and 
   any dependencies (e.g. cell culture lead time, regulatory review periods).
2. A milestone table in this format:

Week | Milestone | Deliverable
-----|-----------|------------
[fill in based on study type and complexity]

Include these milestone types where relevant to the study:
- Study initiation / kickoff call
- Protocol finalisation and sponsor approval
- Materials receipt and QC
- Study start / dosing initiation  
- Interim data review (if applicable)
- Study completion
- Draft report to sponsor
- Final report delivery

If the requested timeline of ${rfp.timeline_weeks} weeks is achievable, 
confirm it. If it is tight, note this professionally and propose a realistic 
alternative with justification. Do not overpromise.
Maximum 300 words plus the table.
`;
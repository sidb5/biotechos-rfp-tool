import { CROProfile, ParsedRFP } from './index';

export const teamQualificationsPrompt = (
  profile: CROProfile,
  rfp: ParsedRFP
): string => `
Write the Team Qualifications section of a proposal from ${profile.company_name} 
for a ${rfp.study_type} study.

Team members available:
${(profile.team_members ?? []).map(m =>
  `- ${m.name}, ${m.title}: ${m.years_experience} years experience. ${m.expertise}`
).join('\n')}

Study type being bid: ${rfp.study_type}
Key assays: ${rfp.assay_types.join(', ')}

Write this section as follows:
1. Opening paragraph: overall team strength and collective experience 
   relevant to this specific study type. 1 paragraph.
2. For each team member who would work on this study: a short profile 
   (3–4 sentences) covering their role on this project, relevant experience, 
   and specific expertise that applies to the assays requested.
3. Closing sentence: who the primary point of contact will be for the sponsor.

Only include team members whose expertise is relevant to ${rfp.study_type} 
and ${rfp.assay_types.join(', ')}.
Do not pad with irrelevant CVs.
Maximum 400 words.
`;
export interface CROProfile {
  id?: string;
  user_id?: string;
  company_name: string;
  company_overview?: string;
  therapeutic_areas?: string[];
  assay_types?: string[];
  team_members?: TeamMember[];
  facility_description?: string;
  accreditations?: string[];
  geographic_reach?: string;
  cros_directory_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TeamMember {
  name: string;
  title: string;
  years_experience: number;
  expertise: string;
}

export interface RFP {
  id?: string;
  cro_id?: string;
  raw_text: string;
  parsed_summary?: ParsedRFP;
  biotech_name?: string;
  status?: 'parsed' | 'proposal_started' | 'proposal_complete';
  created_at?: string;
}

export interface ParsedRFP {
  biotech_name: string;
  study_type: string;
  assay_types: string[];
  species: string;
  primary_endpoints: string[];
  secondary_endpoints: string[];
  sample_count: string;
  timeline_weeks: string;
  deliverables: string[];
  special_requirements: string[];
  ambiguities: string[];
}

export interface Proposal {
  id?: string;
  rfp_id: string;
  cro_id: string;
  status?: 'draft' | 'review' | 'submitted';
  sections?: ProposalSection[];
  created_at?: string;
  updated_at?: string;
}

export interface ProposalSection {
  id?: string;
  proposal_id?: string;
  section_name: SectionName;
  content?: string;
  is_ai_generated?: boolean;
  last_edited_at?: string;
  created_at?: string;
}

export type SectionName =
  | 'executive_summary'
  | 'technical_approach'
  | 'team_qualifications'
  | 'facility_overview'
  | 'proposed_timeline'
  | 'pricing'
  | 'assumptions_exclusions';

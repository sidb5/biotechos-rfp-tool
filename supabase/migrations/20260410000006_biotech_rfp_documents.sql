-- One RFP document per brief (not per engagement).
-- All 10 sections stored separately so each can be regenerated independently.
-- sent_to tracks which engagements have had the full RFP emailed to their CRO.

create table if not exists rfp_documents (
  id                uuid default gen_random_uuid() primary key,
  brief_id          uuid references rfp_internal_briefs(id) on delete cascade not null unique,
  user_id           uuid references auth.users(id) not null,

  -- 10 RFP sections — each stored as text, editable independently
  s1_header         text,   -- RFP header: ID, date, company, contact
  s2_overview       text,   -- Study overview: objective + background
  s3_scope          text,   -- Scope of work (most detailed)
  s4_regulatory     text,   -- Regulatory requirements: GLP, compliance
  s5_deliverables   text,   -- Deliverables with format + due dates
  s6_proposal_reqs  text,   -- What the CRO proposal must contain
  s7_eval_criteria  text,   -- How biotech will score CRO responses
  s8_timeline       text,   -- Submission deadline, Q&A deadline, award date
  s9_terms          text,   -- NDA reminder, IP/data ownership
  s10_contact       text,   -- Contact + submission instructions

  -- Generation metadata
  completeness_score integer default 0,  -- 0-100 rule-based
  rfp_id             text,               -- human-readable e.g. RFP-2026-001
  status             text default 'draft', -- draft | final
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table rfp_documents enable row level security;

create policy "Own RFP documents" on rfp_documents
  for all using (auth.uid() = user_id);

-- Accumulated RFP context notes on the brief level.
-- Populated by the user marking items from meeting debrief panels
-- across any/all engagements that belong to this brief.
-- Read by the RFP generator (Task 6.1) as pre-curated context.
--
-- Shape of each element in the array:
-- {
--   id:                    uuid string,
--   text:                  string,
--   type:                  'rfp_refinement' | 'open_question',
--   source_engagement_id:  uuid string,
--   source_cro_name:       string,
--   added_at:              iso timestamp
-- }

alter table rfp_internal_briefs
  add column if not exists rfp_context_notes jsonb not null default '[]'::jsonb;

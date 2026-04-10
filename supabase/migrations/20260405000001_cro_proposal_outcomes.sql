-- Add outcome tracking columns to proposals
alter table proposals
  add column if not exists outcome text
    check (outcome in ('won','lost','pending','no_decision','withdrawn')),
  add column if not exists outcome_date timestamptz,
  add column if not exists outcome_notes text,
  add column if not exists contract_value numeric,
  add column if not exists loss_reason text
    check (loss_reason in ('price','competitor','timeline','capability','no_response','scope_mismatch','other'));

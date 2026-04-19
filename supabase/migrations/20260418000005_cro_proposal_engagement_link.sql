-- Link proposals to their cro_engagement so the quote page can
-- surface the conversation thread persistently.
alter table proposals
  add column if not exists engagement_id uuid references cro_engagements(id) on delete set null;

create index if not exists proposals_engagement_id_idx on proposals(engagement_id);

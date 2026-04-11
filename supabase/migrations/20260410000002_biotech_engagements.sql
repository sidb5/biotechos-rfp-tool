-- Migration: biotech_engagements
-- cro_engagements: one row per biotech–CRO engagement for a given study.
-- engagement_messages: every outbound and inbound message in a thread.
-- Resend webhook updates delivered_at / bounced status via message resend_message_id.

create table cro_engagements (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade,
  brief_id    uuid        references rfp_internal_briefs(id) on delete cascade,
  cro_id      uuid        references cros_directory(id) on delete set null,   -- null for manual entries
  cro_name    text        not null,
  cro_email   text        not null,
  stage       text        not null default 'enquiry_draft',
  -- stages: enquiry_draft | enquiry_sent | response_received |
  --         followup_draft | followup_sent | meeting_scheduled |
  --         meeting_done | rfp_draft | rfp_sent | awarded | closed
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table engagement_messages (
  id                uuid        default gen_random_uuid() primary key,
  engagement_id     uuid        references cro_engagements(id) on delete cascade,
  direction         text        not null,   -- outbound | inbound
  message_type      text        not null,   -- enquiry | followup | meeting_invite | rfp | response
  subject           text,
  body              text,
  status            text        not null default 'draft',
  -- status: draft | approved | sent | delivered | bounced | failed
  sent_at           timestamptz,
  delivered_at      timestamptz,
  resend_message_id text,                   -- Resend message ID for webhook matching
  ai_generated      boolean     default true,
  created_at        timestamptz default now()
);

-- RLS
alter table cro_engagements enable row level security;
alter table engagement_messages enable row level security;

create policy "Own engagements" on cro_engagements
  for all using (auth.uid() = user_id);

create policy "Own messages" on engagement_messages
  for all using (
    engagement_id in (select id from cro_engagements where user_id = auth.uid())
  );

-- Auto-update updated_at on cro_engagements
-- Requires update_updated_at_column() function created in 20260410000000
create trigger set_updated_at_cro_engagements
  before update on cro_engagements
  for each row execute procedure update_updated_at_column();

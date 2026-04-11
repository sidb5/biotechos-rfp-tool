-- Meeting notes and AI debrief per engagement
-- One record per meeting call (there may be multiple meetings per engagement)

create table if not exists engagement_meetings (
  id              uuid default gen_random_uuid() primary key,
  engagement_id   uuid references cro_engagements(id) on delete cascade not null,
  meeting_date    date,
  attendees       text,
  raw_notes       text not null,
  ai_summary      jsonb,
  -- ai_summary shape: {
  --   gaps_resolved:    string[],
  --   new_concerns:     string[],
  --   rfp_refinements:  string[],
  --   open_questions:   string[]
  -- }
  created_at      timestamptz default now()
);

alter table engagement_meetings enable row level security;

create policy "Own meeting notes" on engagement_meetings
  for all using (
    engagement_id in (
      select id from cro_engagements where user_id = auth.uid()
    )
  );

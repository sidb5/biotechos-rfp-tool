-- SME Micro-Form tables.
-- Auth-less for 48h, code-protected after, hard-expires at 7 days.
-- Reuses the quote token/access-code pattern.

create table sme_forms (
  id             uuid        not null default gen_random_uuid() primary key,
  proposal_id    uuid        not null references proposals on delete cascade,
  token          uuid        not null unique default gen_random_uuid(),
  access_code    text        not null,
  open_until     timestamptz not null,  -- 48h from creation — no code required before this
  hard_expires_at timestamptz not null, -- 7 days from creation — fully dead after this
  created_by     uuid        not null references auth.users on delete cascade,
  status         text        not null default 'pending'
                             check (status in ('pending', 'partially_answered', 'complete'))
);

alter table sme_forms enable row level security;

-- CRO users can read and create their own forms
create policy "CRO users manage own sme_forms"
  on sme_forms
  for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Public read by token (used by /sme/[token] page — no auth)
create policy "Public read by token"
  on sme_forms
  for select
  using (true);

create table sme_form_questions (
  id               uuid        not null default gen_random_uuid() primary key,
  form_id          uuid        not null references sme_forms on delete cascade,
  gap_id           text        not null,
  question_text    text        not null,
  question_type    text        not null check (question_type in ('numeric', 'text', 'yes_no', 'selection')),
  unit_hint        text,
  answer           text,
  answered_by_name text,
  answered_at      timestamptz
);

alter table sme_form_questions enable row level security;

-- CRO users can read their own questions (via form ownership)
create policy "CRO users manage own questions"
  on sme_form_questions
  for all
  using (
    form_id in (
      select id from sme_forms where created_by = auth.uid()
    )
  )
  with check (
    form_id in (
      select id from sme_forms where created_by = auth.uid()
    )
  );

-- Public read by form_id (used by /sme/[token] page)
create policy "Public read questions by form"
  on sme_form_questions
  for select
  using (true);

-- Public write for SME submissions (no auth — SME fills in answers)
create policy "Public submit answers"
  on sme_form_questions
  for update
  using (true)
  with check (true);

create index sme_form_questions_form_idx on sme_form_questions (form_id);

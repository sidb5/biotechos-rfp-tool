-- Knowledge Repository: stores extracted text from CRO-uploaded documents.
-- Used by gap detection to reduce false positives.
-- No binary storage — text only.

create table knowledge_repo_docs (
  id            uuid        not null default gen_random_uuid() primary key,
  cro_user_id   uuid        not null references auth.users on delete cascade,
  filename      text        not null,
  file_type     text        not null check (file_type in ('pdf', 'docx', 'txt')),
  raw_text      text        not null,
  created_at    timestamptz not null default now()
);

alter table knowledge_repo_docs enable row level security;

create policy "Users manage own docs"
  on knowledge_repo_docs
  for all
  using (cro_user_id = auth.uid())
  with check (cro_user_id = auth.uid());

create index knowledge_repo_docs_user_idx on knowledge_repo_docs (cro_user_id, created_at desc);

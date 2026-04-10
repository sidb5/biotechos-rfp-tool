-- Content library: saves refined proposal sections for reuse across proposals
create table content_library (
  id uuid primary key default gen_random_uuid(),
  cro_id uuid references cro_profiles not null,
  section_name text not null,
  assay_types text[],
  study_type text,
  content text not null,
  usage_count integer default 0,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index content_library_cro_section
  on content_library(cro_id, section_name);

create index content_library_assay_types
  on content_library using gin(assay_types);

-- RLS
alter table content_library enable row level security;

create policy "Users can manage their own content library"
  on content_library
  for all
  using (
    cro_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

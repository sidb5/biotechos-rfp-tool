-- Stores snapshots of proposal sections for version history / revert
create table proposal_section_versions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references proposal_sections not null,
  content text not null,
  version_number integer not null,
  saved_by uuid references auth.users,
  created_at timestamptz default now()
);

create index versions_section_id
  on proposal_section_versions(section_id);

-- RLS: accessible if the user owns the proposal that owns the section
alter table proposal_section_versions enable row level security;

create policy "Users can manage versions of their own sections"
  on proposal_section_versions
  for all
  using (
    section_id in (
      select ps.id from proposal_sections ps
      join proposals p on p.id = ps.proposal_id
      join cro_profiles cp on cp.id = p.cro_id
      where cp.user_id = auth.uid()
    )
  );

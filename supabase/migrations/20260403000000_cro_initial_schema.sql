-- CRO company profiles
create table cro_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  company_name text not null,
  company_overview text,
  therapeutic_areas text[],
  assay_types text[],
  team_members jsonb,
  facility_description text,
  accreditations text[],
  geographic_reach text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Incoming RFPs
create table rfps (
  id uuid primary key default gen_random_uuid(),
  cro_id uuid references cro_profiles not null,
  raw_text text not null,
  parsed_summary jsonb,
  biotech_name text,
  status text default 'parsed',
  created_at timestamptz default now()
);

-- Generated proposals
create table proposals (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid references rfps not null,
  cro_id uuid references cro_profiles not null,
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual proposal sections (stored separately for per-section regen)
create table proposal_sections (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals not null,
  section_name text not null,
  content text,
  is_ai_generated boolean default true,
  last_edited_at timestamptz,
  created_at timestamptz default now()
);

-- RLS: enable on all tables
alter table cro_profiles enable row level security;
alter table rfps enable row level security;
alter table proposals enable row level security;
alter table proposal_sections enable row level security;

-- RLS policies: users can only access their own CRO profile and related data
create policy "Users manage own profile"
  on cro_profiles for all
  using (auth.uid() = user_id);

create policy "Users manage own RFPs"
  on rfps for all
  using (cro_id in (select id from cro_profiles where user_id = auth.uid()));

create policy "Users manage own proposals"
  on proposals for all
  using (cro_id in (select id from cro_profiles where user_id = auth.uid()));

create policy "Users manage own proposal sections"
  on proposal_sections for all
  using (proposal_id in (
    select id from proposals
    where cro_id in (select id from cro_profiles where user_id = auth.uid())
  ));

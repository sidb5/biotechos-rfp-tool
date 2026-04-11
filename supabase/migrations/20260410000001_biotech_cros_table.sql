-- Migration: biotech_cros_table
-- Stub CRO directory for matching and outreach.
-- Populated separately (platform Phase 2 — scraping/curation).
-- All biotech-side matching and outreach assumes this table exists
-- but may be empty, which triggers the manual-entry fallback in the UI.

create table cros_directory (
  id                 uuid        default gen_random_uuid() primary key,
  name               text        not null,
  website            text,
  contact_email      text,
  contact_name       text,
  city               text,
  country            text,
  region             text,        -- US | EU | UK | APAC | CN
  biosecure_compliant boolean     default false,
  specialties        text[],      -- e.g. ['tox','pk','in_vivo','bioanalysis','histopath']
  size_category      text,        -- small | mid | large
  glp_certified      boolean     default false,
  notes              text,
  created_at         timestamptz default now()
);

-- No RLS — CRO directory is read-only reference data, not user-owned rows.
-- If user-specific CRO notes are needed in future, add a separate join table.

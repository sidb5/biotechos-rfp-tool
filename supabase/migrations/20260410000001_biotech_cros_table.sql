-- Migration: biotech_cros_table
-- Stub CRO directory for matching and outreach.
-- Populated separately (platform Phase 2 — scraping/curation).
-- All biotech-side matching and outreach assumes this table exists
-- but may be empty, which triggers the manual-entry fallback in the UI.

create table cros_directory (
    id uuid default gen_random_uuid() primary key,

    -- core identity
    name text,
    entity_type text,
    biosecure_compliant boolean,
    website text,
    contact_form_url text,

    -- location
    address text,
    city text,
    state text,
    country text,
    region  text,        -- US | EU | UK | APAC | CN
    phone text,

    -- contact / metadata
    contact_email text,
    bd_key_contact text,
    linkedin text,

    -- descriptive fields
    services_summary text,
    therapeutic_areas text,
    phase_expertise text,
    employee_count text,
    revenue_estimate text,
    founded text,
    notable_clients text,
    reputation_positive text,
    reputation_negative text,
    services_full text,
    glp_certified      boolean     default false,

    -- service flags
    in_vitro boolean,
    in_vivo boolean,
    toxicology boolean,
    dmpk_adme boolean,
    bioanalysis boolean,
    clinical boolean,
    regulatory boolean,
    biostatistics boolean,
    genomics boolean,
    cell_gene boolean,
    imaging boolean,
    cmc boolean,
    biomarkers boolean,
    organoids boolean,
    specialties  text[],      -- e.g. ['tox','pk','in_vivo','bioanalysis','histopath']

    -- confidence scores
    in_vitro_confidence_score integer,
    in_vivo_confidence_score integer,
    toxicology_confidence_score integer,
    dmpk_adme_confidence_score integer,
    bioanalysis_confidence_score integer,
    clinical_confidence_score integer,
    regulatory_confidence_score integer,
    biostatistics_confidence_score integer,
    genomics_confidence_score integer,
    cell_gene_confidence_score integer,
    imaging_confidence_score integer,
    cmc_confidence_score integer,
    biomarkers_confidence_score integer,
    organoids_confidence_score integer,

    -- size
    size_category text,  -- small | mid | large
    created_at   timestamptz default now()
);

-- No RLS — CRO directory is read-only reference data, not user-owned rows.
-- If user-specific CRO notes are needed in future, add a separate join table.
-- Below is the old table structure that has been replaced. please ignore the below.
-- create table cros_directory (
--   id                 uuid        default gen_random_uuid() primary key,
--   name               text        not null,
--   website            text,
--   contact_email      text,
--   contact_name       text,
--   city               text,
--   country            text,
--   region             text,        -- US | EU | UK | APAC | CN
--   biosecure_compliant boolean     default false,
--   specialties        text[],      -- e.g. ['tox','pk','in_vivo','bioanalysis','histopath']
--   size_category      text,        -- small | mid | large
--   glp_certified      boolean     default false,
--   notes              text,
--   created_at         timestamptz default now()
-- );
-- Pricing benchmarks table (seeded with indicative market data)
create table if not exists pricing_benchmarks (
  id uuid primary key default gen_random_uuid(),
  assay_type text not null,
  study_type text,
  region text,
  min_price numeric,
  median_price numeric,
  max_price numeric,
  sample_count integer default 0,
  last_updated timestamptz default now()
);

create index if not exists benchmarks_assay on pricing_benchmarks(assay_type);

-- CRO's own pricing per assay type
create table if not exists cro_assay_pricing (
  id uuid primary key default gen_random_uuid(),
  cro_id uuid references cro_profiles not null,
  assay_type text not null,
  price_per_sample numeric,
  price_notes text,
  updated_at timestamptz default now(),
  unique(cro_id, assay_type)
);

-- RLS: CROs can only read/write their own pricing
alter table cro_assay_pricing enable row level security;

create policy "cro_assay_pricing_select" on cro_assay_pricing
  for select using (
    cro_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

create policy "cro_assay_pricing_insert" on cro_assay_pricing
  for insert with check (
    cro_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

create policy "cro_assay_pricing_update" on cro_assay_pricing
  for update using (
    cro_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

create policy "cro_assay_pricing_delete" on cro_assay_pricing
  for delete using (
    cro_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

-- Benchmarks are public read (anonymised aggregate data)
alter table pricing_benchmarks enable row level security;

create policy "benchmarks_public_read" on pricing_benchmarks
  for select using (true);

-- Seed with realistic indicative data based on published CRO pricing ranges
-- NOTE (future): Replace this seed data with a nightly aggregation job once
-- enough real pricing data exists from actual anonymised proposal submissions
-- across the platform. See /api/cron/aggregate-benchmarks (not yet built).

insert into pricing_benchmarks (assay_type, study_type, region, min_price, median_price, max_price, sample_count)
values
  ('In vitro toxicology',        'Toxicology',          'Global', 5000,   15000,  40000,  24),
  ('DMPK / PK studies',          'DMPK',                'Global', 8000,   25000,  65000,  18),
  ('Safety pharmacology',        'Safety',              'Global', 15000,  48000,  110000, 12),
  ('In vivo efficacy (rodent)',   'In vivo efficacy',    'Global', 18000,  58000,  145000, 31),
  ('In vivo efficacy (non-rodent)', 'In vivo efficacy',  'Global', 75000,  195000, 490000, 9),
  ('Organoid studies',           'Organoid / 3D model', 'Global', 9500,   28000,  72000,  14),
  ('Bioanalysis',                'Bioanalysis',         'Global', 4500,   17000,  44000,  22),
  ('Histopathology',             'Histopathology',      'Global', 3000,   11500,  32000,  19)
on conflict do nothing;

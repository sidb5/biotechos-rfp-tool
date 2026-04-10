-- ── Verification + referral columns on cro_profiles ─────────────────────────
alter table cro_profiles
  add column if not exists verified_domain      text,
  add column if not exists ein                  text,
  add column if not exists verification_method  text
    check (verification_method in ('domain','ein','manual')),
  add column if not exists is_verified          boolean default false,
  add column if not exists verified_at          timestamptz,
  add column if not exists referral_code        text unique;

-- ── Referrals ─────────────────────────────────────────────────────────────────
create table referrals (
  id                uuid primary key default gen_random_uuid(),
  referrer_id       uuid references cro_profiles,
  referee_id        uuid references cro_profiles,
  referral_code     text not null,
  status            text default 'pending'
    check (status in ('pending','completed','rewarded','expired')),
  referee_email     text,
  created_at        timestamptz default now(),
  completed_at      timestamptz,
  reward_applied_at timestamptz
);

alter table referrals enable row level security;

create policy "Users view own referrals"
  on referrals for select
  using (
    referrer_id in (select id from cro_profiles where user_id = auth.uid())
    or
    referee_id  in (select id from cro_profiles where user_id = auth.uid())
  );

create policy "Service role bypass referrals"
  on referrals for all
  using (auth.role() = 'service_role');

-- ── Referral rewards ──────────────────────────────────────────────────────────
create table referral_rewards (
  id              uuid primary key default gen_random_uuid(),
  cro_profile_id  uuid references cro_profiles,
  referral_id     uuid references referrals,
  reward_type     text default 'free_month',
  months_granted  integer default 1,
  applied_at      timestamptz default now(),
  expires_at      timestamptz
);

alter table referral_rewards enable row level security;

create policy "Users view own rewards"
  on referral_rewards for select
  using (
    cro_profile_id in (select id from cro_profiles where user_id = auth.uid())
  );

create policy "Service role bypass rewards"
  on referral_rewards for all
  using (auth.role() = 'service_role');

-- ── Referral sources (attribution tracking — Mechanic D) ─────────────────────
create table referral_sources (
  id          uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('pdf_footer','word_footer','share_link')),
  proposal_id uuid references proposals,
  cro_id      uuid references cro_profiles,
  share_token text,
  ip_hash     text,
  created_at  timestamptz default now()
);

alter table referral_sources enable row level security;

create policy "Service role bypass sources"
  on referral_sources for all
  using (auth.role() = 'service_role');

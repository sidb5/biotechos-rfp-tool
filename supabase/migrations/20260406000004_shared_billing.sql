-- Billing tables
-- Note: uses cro_profile_id (our org unit) instead of organisation_id

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  cro_profile_id uuid references cro_profiles not null unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null
    check (plan in ('free','starter','pro'))
    default 'free',
  status text not null
    check (status in ('active','cancelled','past_due','trialing','paused'))
    default 'active',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean default false,
  trial_ends_at        timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table usage_tracking (
  id              uuid primary key default gen_random_uuid(),
  cro_profile_id  uuid references cro_profiles not null,
  month           text not null, -- YYYY-MM
  proposals_created integer default 0,
  rfps_uploaded     integer default 0,
  updated_at        timestamptz default now(),
  unique(cro_profile_id, month)
);

-- RLS
alter table subscriptions  enable row level security;
alter table usage_tracking enable row level security;

create policy "Users manage own subscription"
  on subscriptions for all
  using (
    cro_profile_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

create policy "Users manage own usage"
  on usage_tracking for all
  using (
    cro_profile_id in (
      select id from cro_profiles where user_id = auth.uid()
    )
  );

-- Service role bypass (needed for webhook updates)
create policy "Service role bypass subscriptions"
  on subscriptions for all
  using (auth.role() = 'service_role');

create policy "Service role bypass usage"
  on usage_tracking for all
  using (auth.role() = 'service_role');

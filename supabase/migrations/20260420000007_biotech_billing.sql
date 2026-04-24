-- biotech_subscriptions
-- Tracks Stripe subscription state for buy-side users (SourceMyCRO / SourceMyCDMO).
-- Keyed on user_id (no separate profile table on the biotech side).
create table if not exists biotech_subscriptions (
  user_id                uuid        not null primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text        not null default 'free' check (plan in ('free', 'starter', 'pro')),
  status                 text        not null default 'active',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     not null default false,
  updated_at             timestamptz not null default now()
);

alter table biotech_subscriptions enable row level security;

create policy "biotech_subscriptions: user manages own row"
  on biotech_subscriptions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypass for webhook writes
create policy "biotech_subscriptions: service role full access"
  on biotech_subscriptions
  for all
  to service_role
  using (true) with check (true);

-- Index for webhook lookups by Stripe subscription ID
create index if not exists biotech_subscriptions_stripe_sub_idx
  on biotech_subscriptions (stripe_subscription_id);

-- biotech_usage_tracking
-- Tracks monthly usage counters for buy-side users.
create table if not exists biotech_usage_tracking (
  id             uuid        not null primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  month          text        not null,  -- YYYY-MM
  briefs_created integer     not null default 0,
  rfps_sent      integer     not null default 0,
  updated_at     timestamptz not null default now(),
  unique (user_id, month)
);

alter table biotech_usage_tracking enable row level security;

create policy "biotech_usage_tracking: user manages own rows"
  on biotech_usage_tracking
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "biotech_usage_tracking: service role full access"
  on biotech_usage_tracking
  for all
  to service_role
  using (true) with check (true);

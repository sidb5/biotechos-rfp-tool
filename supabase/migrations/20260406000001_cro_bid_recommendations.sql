-- Bid/no-bid recommendations for RFPs
create table if not exists bid_recommendations (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid references rfps not null unique,
  recommendation text
    check (recommendation in ('bid', 'no_bid', 'bid_with_caution')),
  confidence_score integer
    check (confidence_score between 0 and 100),
  reasoning jsonb,
  fit_scores jsonb,
  created_at timestamptz default now()
);

-- CROs can only see recommendations for their own RFPs
alter table bid_recommendations enable row level security;

create policy "bid_recs_select" on bid_recommendations
  for select using (
    rfp_id in (
      select r.id from rfps r
      join cro_profiles p on p.id = r.cro_id
      where p.user_id = auth.uid()
    )
  );

create policy "bid_recs_insert" on bid_recommendations
  for insert with check (
    rfp_id in (
      select r.id from rfps r
      join cro_profiles p on p.id = r.cro_id
      where p.user_id = auth.uid()
    )
  );

create policy "bid_recs_update" on bid_recommendations
  for update using (
    rfp_id in (
      select r.id from rfps r
      join cro_profiles p on p.id = r.cro_id
      where p.user_id = auth.uid()
    )
  );

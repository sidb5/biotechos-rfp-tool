-- Email send log
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  template_name text not null,
  recipient_email text not null,
  subject text,
  status text default 'sent',
  error_text text,
  created_at timestamptz default now()
);

alter table email_logs enable row level security;

create policy "email_logs_own" on email_logs
  for select using (user_id = auth.uid());

-- User email preferences (opt-out per template type)
create table if not exists user_email_preferences (
  user_id uuid references auth.users primary key,
  rfp_parsed boolean default true,
  deadline_reminders boolean default true,
  proposal_complete boolean default true,
  win_notification boolean default true,
  weekly_summary boolean default true,
  updated_at timestamptz default now()
);

alter table user_email_preferences enable row level security;

create policy "email_prefs_own_select" on user_email_preferences
  for select using (user_id = auth.uid());

create policy "email_prefs_own_insert" on user_email_preferences
  for insert with check (user_id = auth.uid());

create policy "email_prefs_own_update" on user_email_preferences
  for update using (user_id = auth.uid());

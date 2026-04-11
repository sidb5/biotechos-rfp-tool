-- Migration: biotech_user_settings
-- Per-user settings for Product 2 outreach and RFP delivery.
-- Required before email sending works: sender_email (Reply-To address).
-- All fields nullable — missing values fall back to auth.users email/name.

create table biotech_user_settings (
  user_id                  uuid        primary key references auth.users(id) on delete cascade,
  sender_display_name      text,           -- shown in email From field
  sender_email             text,           -- Reply-To on all outbound emails (required before sending)
  company_name             text,           -- used in RFP headers and email signatures
  scheduling_link          text,           -- Calendly / Cal.com booking URL
  response_deadline_days   integer default 10,  -- default days CROs have to respond
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table biotech_user_settings enable row level security;

create policy "Own settings" on biotech_user_settings
  for all using (auth.uid() = user_id);

create trigger set_updated_at_biotech_user_settings
  before update on biotech_user_settings
  for each row execute procedure update_updated_at_column();

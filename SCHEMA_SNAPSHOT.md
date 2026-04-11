# SCHEMA_SNAPSHOT.md
# Single source of truth for all existing database tables.
# Last updated: April 2026
#
# HOW TO USE:
# Before creating any new table, check here first.
# If a table with the same name or purpose already exists, reuse it or
# choose a clearly distinct name. Do not create duplicates.
# Do NOT read migration files to understand schema — use this file.
# Update this file manually after every new migration is applied.

---

## EXISTING TABLES — CRO sell-side (do not modify)

These 16 tables belong to the shipped CRO Proposal Engine.
Do not add columns, rename, drop, or alter any of these.

### bid_recommendations
AI bid/no-bid recommendations for incoming CRO RFPs.
```
id                uuid        not null
rfp_id            uuid        not null  FK → rfps.id
recommendation    text
confidence_score  integer
reasoning         jsonb
fit_scores        jsonb
created_at        timestamptz
```

### content_library
Reusable proposal section content per CRO. Powers self-improving proposal drafts.
```
id            uuid        not null
cro_id        uuid        not null  FK → cro_profiles.id
section_name  text        not null
assay_types   text[]
study_type    text
content       text        not null
usage_count   integer
last_used_at  timestamptz
created_at    timestamptz
updated_at    timestamptz
```

### cro_assay_pricing
Per-assay pricing for CRO quote pre-fill.
```
id               uuid     not null
cro_id           uuid     not null  FK → cro_profiles.id
assay_type       text     not null
price_per_sample numeric
price_notes      text
updated_at       timestamptz
```

### cro_profiles
Core CRO company profile. One row per CRO user. Source of truth for all proposals.
```
id                            uuid     not null
user_id                       uuid     not null  FK → auth.users
company_name                  text     not null
company_overview              text
therapeutic_areas             text[]
assay_types                   text[]
team_members                  jsonb
facility_description          text
accreditations                text[]
geographic_reach              text
is_complete                   boolean
logo_url                      text
verified_domain               text
ein                           text
verification_method           text
is_verified                   boolean
verified_at                   timestamptz
referral_code                 text
pending_verification_email    text
verification_token            text
verification_token_expires_at timestamptz
created_at                    timestamptz
updated_at                    timestamptz
```

### email_logs
Audit log of all emails sent via Resend. Reuse this for all new email sends.
```
id               uuid    not null
user_id          uuid    FK → auth.users (nullable)
template_name    text    not null
recipient_email  text    not null
subject          text
status           text    'sent' | 'delivered' | 'bounced' | 'failed'
error_text       text
created_at       timestamptz
```

### pricing_benchmarks
Market pricing reference data by assay type and region.
```
id           uuid     not null
assay_type   text     not null
study_type   text
region       text
min_price    numeric
median_price numeric
max_price    numeric
sample_count integer
last_updated timestamptz
```

### proposal_section_versions
Version history for individual proposal sections.
```
id             uuid     not null
section_id     uuid     not null  FK → proposal_sections.id
content        text     not null
version_number integer  not null
saved_by       uuid     FK → auth.users
created_at     timestamptz
```

### proposal_sections
Individual sections of a CRO proposal (executive summary, technical approach, etc).
```
id              uuid     not null
proposal_id     uuid     not null  FK → proposals.id
section_name    text     not null
content         text
is_ai_generated boolean
last_edited_at  timestamptz
created_at      timestamptz
```

### proposals
A CRO's proposal response to an incoming RFP. Core table for the QuickQuote product.
```
id                    uuid     not null
rfp_id                uuid     not null  FK → rfps.id
cro_id                uuid     not null  FK → cro_profiles.id
status                text     'draft' | 'complete' | 'sent' | 'won' | 'lost'
outcome               text
outcome_date          timestamptz
outcome_notes         text
contract_value        numeric
loss_reason           text
quote_data            jsonb
share_token           text
share_enabled         boolean
share_views           integer
share_first_viewed_at timestamptz
share_last_viewed_at  timestamptz
created_at            timestamptz
updated_at            timestamptz
```

### referral_rewards
Rewards granted to CROs for successful referrals.
```
id               uuid   not null
cro_profile_id   uuid   FK → cro_profiles.id
referral_id      uuid   FK → referrals.id
reward_type      text
months_granted   integer
applied_at       timestamptz
expires_at       timestamptz
```

### referral_sources
Tracks where referral traffic originated.
```
id           uuid   not null
source_type  text   not null
proposal_id  uuid   FK → proposals.id (nullable)
cro_id       uuid   FK → cro_profiles.id (nullable)
share_token  text
ip_hash      text
created_at   timestamptz
```

### referrals
CRO referral program — one row per referral relationship.
```
id                uuid   not null
referrer_id       uuid   FK → cro_profiles.id
referee_id        uuid   FK → cro_profiles.id (nullable until signup)
referral_code     text   not null
status            text   'pending' | 'completed' | 'rewarded'
referee_email     text
created_at        timestamptz
completed_at      timestamptz
reward_applied_at timestamptz
```

### rfps
⚠️ WARNING: This is the CRO-side RFP table — RFPs received BY CROs from biotechs.
Do NOT reuse this for the biotech-side feature. Any new biotech-side table
that stores RFP or brief data must use a clearly different name.
```
id             uuid   not null
cro_id         uuid   not null  FK → cro_profiles.id
raw_text       text   not null
parsed_summary jsonb
biotech_name   text
status         text   'new' | 'in_progress' | 'submitted' | 'archived'
created_at     timestamptz
```

### subscriptions
Stripe subscription state per CRO.
```
id                     uuid   not null
cro_profile_id         uuid   not null  FK → cro_profiles.id
stripe_customer_id     text
stripe_subscription_id text
plan                   text   'free' | 'starter' | 'pro'
status                 text   'active' | 'trialing' | 'canceled' | 'past_due'
current_period_start   timestamptz
current_period_end     timestamptz
cancel_at_period_end   boolean
trial_ends_at          timestamptz
created_at             timestamptz
updated_at             timestamptz
```

### usage_tracking
Monthly usage counters per CRO for plan limit enforcement.
```
id                uuid   not null
cro_profile_id    uuid   not null  FK → cro_profiles.id
month             text   format: 'YYYY-MM'
proposals_created integer
rfps_uploaded     integer
updated_at        timestamptz
```

### user_email_preferences
Per-user email notification opt-in settings.
```
user_id            uuid    not null  FK → auth.users
rfp_parsed         boolean
deadline_reminders boolean
proposal_complete  boolean
win_notification   boolean
weekly_summary     boolean
updated_at         timestamptz
```

---

## NEW TABLES — Biotech buy-side

### rfp_internal_briefs ✓ CREATED (20260410000000_biotech_rfp_internal_briefs.sql)
Private internal knowledge dump for the biotech user. Never sent to CROs.
Distinct from the CRO-side `rfps` table — do NOT confuse the two.
```
id              uuid        not null  PK
user_id         uuid        FK → auth.users (cascade delete)
title           text        internal label, set in Task 1.2
raw_inputs      jsonb       {text, docs: [{filename, text}], voice_transcript}
extracted_data  jsonb       12-field structured object (set in Task 1.2)
classification  text        tox | pk | efficacy | in_vitro | combination | etc
status          text        'active' | 'archived'  default 'active'
created_at      timestamptz
updated_at      timestamptz (auto-updated via trigger)
```
RLS: `auth.uid() = user_id` (all operations)

### cros_directory ✓ CREATED (20260410000001_biotech_cros_table.sql)
CRO directory for matching and outreach. Stub — table exists, rows populated separately.
No RLS (read-only reference data).
```
id                  uuid        not null  PK
name                text        not null
website             text
contact_email       text
contact_name        text
city                text
country             text
region              text        US | EU | UK | APAC | CN
biosecure_compliant boolean     default false
specialties         text[]      e.g. ['tox','pk','in_vivo','bioanalysis','histopath']
size_category       text        small | mid | large
glp_certified       boolean     default false
notes               text
created_at          timestamptz
```

### cro_engagements ✓ CREATED (20260410000002_biotech_engagements.sql)
One row per biotech-CRO relationship for a given study need.
```
id          uuid        not null  PK
user_id     uuid        FK → auth.users (cascade delete)
brief_id    uuid        FK → rfp_internal_briefs.id (cascade delete)
cro_id      uuid        FK → cros.id (set null on delete) — null for manual entries
cro_name    text        not null
cro_email   text        not null
stage       text        default 'enquiry_draft'
            stages: enquiry_draft | enquiry_sent | response_received |
                    followup_draft | followup_sent | meeting_scheduled |
                    meeting_done | rfp_draft | rfp_sent | awarded | closed
created_at  timestamptz
updated_at  timestamptz (auto-updated via trigger)
```
RLS: `auth.uid() = user_id` (all operations)

### engagement_messages ✓ CREATED (20260410000002_biotech_engagements.sql)
Every outbound and inbound message in an engagement thread.
```
id                uuid        not null  PK
engagement_id     uuid        FK → cro_engagements.id (cascade delete)
direction         text        not null  outbound | inbound
message_type      text        not null  enquiry | followup | meeting_invite | rfp | response
subject           text
body              text
status            text        default 'draft'
                  values: draft | approved | sent | delivered | bounced | failed
sent_at           timestamptz
delivered_at      timestamptz
resend_message_id text        Resend message ID for webhook delivery tracking
ai_generated      boolean     default true
created_at        timestamptz
```
RLS: engagement_id in (select id from cro_engagements where user_id = auth.uid())

### biotech_user_settings ✓ CREATED (20260410000003_biotech_user_settings.sql)
Per-user settings for Product 2 outreach and RFP delivery.
All fields nullable — code falls back to auth.users email/name if not set.
```
user_id                  uuid     not null  PK  FK → auth.users (cascade delete)
sender_display_name      text     shown in email From field
sender_email             text     Reply-To on all outbound emails (required before sending)
company_name             text     used in RFP headers and email signatures
scheduling_link          text     Calendly / Cal.com booking URL
response_deadline_days   integer  default 10
created_at               timestamptz
updated_at               timestamptz (auto-updated via trigger)
```
RLS: `auth.uid() = user_id` (all operations)

### engagement_meetings (intended)
Meeting notes and AI debrief output per engagement.


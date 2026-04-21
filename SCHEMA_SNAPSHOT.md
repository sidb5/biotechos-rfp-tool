# SCHEMA_SNAPSHOT.md
# Single source of truth for all existing database tables.
# Last updated: April 2026 — fully reconciled against all 36 migration files.
#
# HOW TO USE:
# Before creating any new table, check here first.
# If a table with the same name or purpose already exists, reuse it or
# choose a clearly distinct name. Do not create duplicates.
# Do NOT read migration files to understand schema — use this file.
# Update this file manually after every new migration is applied.

---

## EXISTING TABLES — CRO sell-side (Product 1)

### bid_recommendations
AI bid/no-bid recommendations for incoming CRO RFPs.
```
id                uuid        not null  PK  default gen_random_uuid()
rfp_id            uuid        not null  FK → rfps.id  UNIQUE
recommendation    text        check: 'bid' | 'no_bid' | 'bid_with_caution'
confidence_score  integer     check: 0–100
reasoning         jsonb
fit_scores        jsonb
created_at        timestamptz default now()
```
RLS: SELECT/INSERT/UPDATE restricted to own CRO's RFPs.

### content_library
Reusable proposal section content per CRO. Powers self-improving proposal drafts.
```
id            uuid        not null  PK  default gen_random_uuid()
cro_id        uuid        not null  FK → cro_profiles.id
section_name  text        not null
assay_types   text[]
study_type    text
content       text        not null
usage_count   integer     default 0
last_used_at  timestamptz
created_at    timestamptz default now()
updated_at    timestamptz default now()
```
RLS: all operations restricted to own cro_id.
Index: (cro_id, section_name); GIN on assay_types.

### cro_assay_pricing
Per-assay pricing for CRO quote pre-fill.
```
id               uuid     not null  PK  default gen_random_uuid()
cro_id           uuid     not null  FK → cro_profiles.id
assay_type       text     not null
price_per_sample numeric
price_notes      text
updated_at       timestamptz default now()
UNIQUE: (cro_id, assay_type)
```
RLS: SELECT/INSERT/UPDATE/DELETE restricted to own cro_id.

### cro_profiles
Core CRO company profile. One row per CRO user. Source of truth for all proposals.
```
id                            uuid     not null  PK  default gen_random_uuid()
user_id                       uuid     not null  FK → auth.users  UNIQUE
company_name                  text     not null
company_overview              text
therapeutic_areas             text[]
assay_types                   text[]
team_members                  jsonb
facility_description          text
accreditations                text[]
geographic_reach              text
is_complete                   boolean  default false
logo_url                      text
verified_domain               text
ein                           text
verification_method           text     check: 'domain' | 'ein' | 'manual'
is_verified                   boolean  default false
verified_at                   timestamptz
referral_code                 text     UNIQUE
pending_verification_email    text
verification_token            text
verification_token_expires_at timestamptz
cros_directory_id             uuid     nullable  FK → cros_directory.id
sender_display_name           text     shown in email From field
sender_email                  text     Reply-To on outbound quotes/proposals
created_at                    timestamptz default now()
updated_at                    timestamptz default now()
```
RLS: all operations restricted to own user_id.

### email_logs
Audit log of all emails sent via Resend. Reuse this for all new email sends.
```
id               uuid    not null  PK  default gen_random_uuid()
user_id          uuid    nullable  FK → auth.users
template_name    text    not null
recipient_email  text    not null
subject          text
status           text    default 'sent'  values: 'sent' | 'delivered' | 'bounced' | 'failed' | 'skipped'
error_text       text
created_at       timestamptz default now()
```
RLS: SELECT restricted to own user_id.

### pricing_benchmarks
Market pricing reference data by assay type and region.
```
id           uuid     not null  PK  default gen_random_uuid()
assay_type   text     not null
study_type   text
region       text
min_price    numeric
median_price numeric
max_price    numeric
sample_count integer  default 0
last_updated timestamptz default now()
```
RLS: public read (SELECT USING true). No write via app.
Index: (assay_type).

### proposal_section_versions
Version history for individual proposal sections.
```
id             uuid     not null  PK  default gen_random_uuid()
section_id     uuid     not null  FK → proposal_sections.id
content        text     not null
version_number integer  not null
saved_by       uuid     FK → auth.users
created_at     timestamptz default now()
```
RLS: restricted to own proposal sections (via join chain).
Index: (section_id).

### proposal_sections
Individual sections of a CRO proposal (executive summary, technical approach, etc).
```
id              uuid     not null  PK  default gen_random_uuid()
proposal_id     uuid     not null  FK → proposals.id
section_name    text     not null
content         text
is_ai_generated boolean  default true
last_edited_at  timestamptz
created_at      timestamptz default now()
```
RLS: restricted to own proposals (via join chain).

### proposals
A CRO's proposal/quote response to an incoming request. Core table for the QuickQuote product.
```
id                    uuid     not null  PK  default gen_random_uuid()
rfp_id                uuid     not null  FK → rfps.id
cro_id                uuid     not null  FK → cro_profiles.id
status                text     default 'draft'  values: 'draft' | 'complete' | 'sent' | 'won' | 'lost'
outcome               text     check: 'won' | 'lost' | 'pending' | 'no_decision' | 'withdrawn'
outcome_date          timestamptz
outcome_notes         text
contract_value        numeric
loss_reason           text     check: 'price' | 'competitor' | 'timeline' | 'capability' |
                                       'no_response' | 'scope_mismatch' | 'other'
quote_data            jsonb
share_token           text     UNIQUE  default encode(gen_random_bytes(8), 'hex')
share_enabled         boolean  default false
share_views           integer  default 0
share_first_viewed_at timestamptz
share_last_viewed_at  timestamptz
engagement_id         uuid     nullable  FK → cro_engagements.id (set null on delete)
                               set when the quote is emailed; links proposal to its reply thread
gap_citations         jsonb    default '[]'  array of citation objects from SME-confirmed gap data
created_at            timestamptz default now()
updated_at            timestamptz default now()
```
RLS: all operations restricted to own cro_id.

### knowledge_repo_docs
Extracted plain text from CRO-uploaded documents. Used by gap detection to reduce false positives.
No binary storage — text only.
```
id            uuid        not null  PK  default gen_random_uuid()
cro_user_id   uuid        not null  FK → auth.users (cascade delete)
filename      text        not null
file_type     text        not null  check: 'pdf' | 'docx' | 'txt'
raw_text      text        not null
created_at    timestamptz not null  default now()
```
RLS: all operations restricted to own cro_user_id.
Index: (cro_user_id, created_at DESC).
Limits: 25 docs per CRO, 10 MB per file (enforced in upload route).

### sme_forms
One SME micro-form per proposal. Auth-less for 48h, code-protected after, hard-expires at 7 days.
```
id              uuid        not null  PK  default gen_random_uuid()
proposal_id     uuid        not null  FK → proposals (cascade delete)
token           uuid        not null  UNIQUE  default gen_random_uuid()  used in /sme/[token] URL
access_code     text        not null  6-char alphanumeric code
open_until      timestamptz not null  48h from creation — no code required before this
hard_expires_at timestamptz not null  7 days from creation — fully dead after this
created_by      uuid        not null  FK → auth.users (cascade delete)
status          text        not null  default 'pending'  check: 'pending' | 'partially_answered' | 'complete'
```
RLS: CRO users manage own forms; public read by token.

### sme_form_questions
One row per gap question per SME form.
```
id               uuid        not null  PK  default gen_random_uuid()
form_id          uuid        not null  FK → sme_forms (cascade delete)
gap_id           text        not null  matches gap_id from gap detection JSON
question_text    text        not null
question_type    text        not null  check: 'numeric' | 'text' | 'yes_no' | 'selection'
unit_hint        text        nullable
answer           text        nullable  written by SME on submit
answered_by_name text        nullable  SME's name typed at form load
answered_at      timestamptz nullable
```
RLS: CRO users manage own questions (via form ownership); public read + public submit answers.
Index: (form_id).

### referral_rewards
Rewards granted to CROs for successful referrals.
```
id               uuid   not null  PK  default gen_random_uuid()
cro_profile_id   uuid   FK → cro_profiles.id
referral_id      uuid   FK → referrals.id
reward_type      text   default 'free_month'
months_granted   integer default 1
applied_at       timestamptz default now()
expires_at       timestamptz
```
RLS: SELECT restricted to own cro_profile_id; service role bypasses all.

### referral_sources
Tracks where referral traffic originated.
```
id           uuid   not null  PK  default gen_random_uuid()
source_type  text   not null  check: 'pdf_footer' | 'word_footer' | 'share_link'
proposal_id  uuid   nullable  FK → proposals.id
cro_id       uuid   nullable  FK → cro_profiles.id
share_token  text
ip_hash      text
created_at   timestamptz default now()
```
RLS: service role only (no user-facing access).

### referrals
CRO referral program — one row per referral relationship.
```
id                uuid   not null  PK  default gen_random_uuid()
referrer_id       uuid   FK → cro_profiles.id
referee_id        uuid   nullable  FK → cro_profiles.id (null until referee signs up)
referral_code     text   not null
status            text   default 'pending'  check: 'pending' | 'completed' | 'rewarded' | 'expired'
referee_email     text
created_at        timestamptz default now()
completed_at      timestamptz
reward_applied_at timestamptz
```
RLS: SELECT for referrer or referee; service role bypasses all.

### rfps
⚠️ WARNING: CRO-side table — RFPs received BY CROs from biotechs.
Do NOT reuse for biotech-side feature. Biotech-side brief storage uses rfp_internal_briefs.
```
id             uuid   not null  PK  default gen_random_uuid()
cro_id         uuid   not null  FK → cro_profiles.id
raw_text       text   not null
parsed_summary jsonb
biotech_name   text
status         text   default 'parsed'  values: 'new' | 'in_progress' | 'submitted' | 'archived'
created_at     timestamptz default now()
```
RLS: all operations restricted to own cro_id.

### subscriptions
Stripe subscription state per CRO.
```
id                     uuid   not null  PK  default gen_random_uuid()
cro_profile_id         uuid   not null  FK → cro_profiles.id  UNIQUE
stripe_customer_id     text   UNIQUE
stripe_subscription_id text   UNIQUE
plan                   text   not null  default 'free'  check: 'free' | 'starter' | 'pro'
status                 text   not null  default 'active'  check: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused'
current_period_start   timestamptz
current_period_end     timestamptz
cancel_at_period_end   boolean  default false
trial_ends_at          timestamptz
created_at             timestamptz default now()
updated_at             timestamptz default now()
```
RLS: own cro_profile_id; service role bypasses all.

### usage_tracking
Monthly usage counters per CRO for plan limit enforcement.
```
id                uuid   not null  PK  default gen_random_uuid()
cro_profile_id    uuid   not null  FK → cro_profiles.id
month             text   not null  format: 'YYYY-MM'
proposals_created integer default 0
rfps_uploaded     integer default 0
updated_at        timestamptz default now()
UNIQUE: (cro_profile_id, month)
```
RLS: own cro_profile_id; service role bypasses all.

### user_email_preferences
Per-user email notification opt-in settings.
```
user_id            uuid    not null  PK  FK → auth.users
rfp_parsed         boolean default true
deadline_reminders boolean default true
proposal_complete  boolean default true
win_notification   boolean default true
weekly_summary     boolean default true
updated_at         timestamptz default now()
```
RLS: SELECT/INSERT/UPDATE restricted to own user_id.

### cro_user_settings
Per-user CRO preferences. Mirrors biotech_user_settings for the CRO persona.
New users default to 'assisted'. Existing CRO users grandfathered into 'native'.
```
id            uuid        not null  PK  default gen_random_uuid()
user_id       uuid        not null  UNIQUE  FK → auth.users (cascade delete)
capture_mode  text        not null  default 'assisted'  check: 'assisted' | 'native'
created_at    timestamptz not null  default now()
updated_at    timestamptz not null  default now()
```
RLS: SELECT/INSERT/UPDATE restricted to own user_id.

---

## EXISTING TABLES — Biotech buy-side (Product 2)

### rfp_internal_briefs
Private internal knowledge dump for the biotech user. Never sent to CROs.
Distinct from the CRO-side `rfps` table — do NOT confuse the two.
```
id               uuid        not null  PK  default gen_random_uuid()
user_id          uuid        not null  FK → auth.users (cascade delete)
title            text        internal label
raw_inputs       jsonb       default '{"text":"","docs":[],"voice_transcript":""}'
                             shape: { text, docs: [{filename, text}], voice_transcript }
extracted_data   jsonb       12-field structured object (compound, MOA, indication, etc.)
                             ⚠️ NEVER pass these fields to outbound message generation prompts
classification   text        tox | pk | efficacy | in_vitro | combination | etc
status           text        default 'active'  values: 'active' | 'archived'
rfp_context_notes jsonb      default '[]'  array of free-text context notes added by user
enquiry_template  jsonb      cached outreach template: { subject, body, generated_at, brief_hash }
created_at       timestamptz default now()
updated_at       timestamptz default now()  (auto-updated via trigger)
```
RLS: all operations restricted to own user_id.

### cros_directory
CRO directory for matching and outreach. No RLS — read-only reference data.
```
id                          uuid     not null  PK  default gen_random_uuid()
name                        text
entity_type                 text
biosecure_compliant         boolean
website                     text
contact_form_url            text
address                     text
city                        text
state                       text
country                     text
region                      text     values: US | EU | UK | APAC | CN
phone                       text
contact_email               text
contact_name                text
bd_key_contact              text
linkedin                    text
services_summary            text
therapeutic_areas           text
phase_expertise             text
employee_count              text
revenue_estimate            text
founded                     text
notable_clients             text
reputation_positive         text
reputation_negative         text
services_full               text
glp_certified               boolean  default false
notes                       text
specialties                 text[]
size_category               text     values: small | mid | large
-- Service capability booleans:
in_vitro                    boolean
in_vivo                     boolean
toxicology                  boolean
dmpk_adme                   boolean
bioanalysis                 boolean
clinical                    boolean
regulatory                  boolean
biostatistics               boolean
genomics                    boolean
cell_gene                   boolean
imaging                     boolean
cmc                         boolean
biomarkers                  boolean
organoids                   boolean
-- AI confidence scores (0–100) per service:
in_vitro_confidence_score   integer
in_vivo_confidence_score    integer
toxicology_confidence_score integer
dmpk_adme_confidence_score  integer
bioanalysis_confidence_score integer
clinical_confidence_score   integer
regulatory_confidence_score integer
biostatistics_confidence_score integer
genomics_confidence_score   integer
cell_gene_confidence_score  integer
imaging_confidence_score    integer
cmc_confidence_score        integer
biomarkers_confidence_score integer
organoids_confidence_score  integer
-- Modality booleans (added 2026-04-20):
small_molecule              boolean  default true   CRO handles small molecule compounds
biologic                    boolean  default false  CRO handles biologics (antibodies, proteins, gene therapy)
created_at                  timestamptz default now()
```
RLS: DISABLED — read-only public reference table.

### cro_engagements
One row per biotech-CRO relationship for a given study need.
Also used for CRO-initiated engagements (when a CRO pastes an inbound enquiry).
```
id              uuid        not null  PK  default gen_random_uuid()
user_id         uuid        not null  FK → auth.users (cascade delete)
brief_id        uuid        nullable  FK → rfp_internal_briefs.id (cascade delete)
                            null when initiator='cro' (no internal brief exists)
cro_id          uuid        nullable  FK → cros_directory.id (set null on delete)
cro_name        text        not null
cro_email       text        not null
stage           text        not null  default 'enquiry_draft'
                stages: enquiry_draft | enquiry_sent | response_received |
                        followup_draft | followup_sent | meeting_scheduled |
                        meeting_done | rfp_draft | rfp_sent | awarded | closed
capture_mode    text        not null  default 'native'  check: 'assisted' | 'native'
                IMMUTABLE after creation — enforced by trigger
reply_to_address text       the full Reply-To header string (e.g. "Name via BiotechOS <reply.uuid@domain>")
                            stored so it doesn't need to be re-derived on every send
initiator       text        not null  default 'biotech'  check: 'biotech' | 'cro'
archived        boolean     not null  default false  soft-delete — hides from all lists
-- Quote fields (populated when biotech user logs a CRO quote):
quoted_amount   numeric(14,2)
quoted_currency text        default 'USD'
quoted_timeline text
quote_valid_until date
quote_notes     text
created_at      timestamptz default now()
updated_at      timestamptz default now()  (auto-updated via trigger)
```
RLS: all operations restricted to own user_id.
Index: (user_id, archived, updated_at DESC) WHERE archived = false.
Trigger: capture_mode is immutable after insert (prevents accidental changes).

### engagement_messages
Every outbound and inbound message in an engagement thread.
```
id                uuid        not null  PK  default gen_random_uuid()
engagement_id     uuid        not null  FK → cro_engagements.id (cascade delete)
direction         text        not null  values: outbound | inbound
message_type      text        not null  values: enquiry | followup | meeting_invite | rfp | response
subject           text
body              text
status            text        not null  default 'draft'
                  values: draft | approved | dismissed | sent | delivered | bounced | failed | received
sent_at           timestamptz
delivered_at      timestamptz
resend_message_id text        Resend message ID for webhook delivery tracking / dedup
ai_generated      boolean     default true
ai_metadata       jsonb       extra AI generation metadata (model, tokens, prompt_version, etc.)
created_at        timestamptz default now()
```
RLS: restricted to engagements owned by auth.uid().

### engagement_meetings
Meeting notes and AI debrief output per engagement.
```
id            uuid        not null  PK  default gen_random_uuid()
engagement_id uuid        not null  FK → cro_engagements.id (cascade delete)
meeting_date  date
attendees     text
raw_notes     text        not null
ai_summary    jsonb       AI-generated debrief: { key_points, next_steps, red_flags, recommended_followup }
created_at    timestamptz default now()
```
RLS: restricted to engagements owned by auth.uid().

### biotech_user_settings
Per-user settings for Product 2 outreach and RFP delivery.
All fields nullable — code falls back to auth.users email/name if not set.
```
user_id                  uuid     not null  PK  FK → auth.users (cascade delete)
sender_display_name      text     shown in email From field
sender_email             text     Reply-To on all outbound emails (required before sending)
company_name             text     used in RFP headers and email signatures
scheduling_link          text     Calendly / Cal.com booking URL
response_deadline_days   integer  default 10
rfp_section_defaults     jsonb    default '{}'  user-saved default text per RFP section
capture_mode             text     not null  default 'assisted'  check: 'assisted' | 'native'
created_at               timestamptz default now()
updated_at               timestamptz default now()  (auto-updated via trigger)
```
RLS: all operations restricted to own user_id.

### rfp_documents
Structured RFP document output per brief. One-to-one with rfp_internal_briefs.
```
id                  uuid        not null  PK  default gen_random_uuid()
brief_id            uuid        not null  FK → rfp_internal_briefs.id (cascade delete)  UNIQUE
user_id             uuid        not null  FK → auth.users
s1_header           text        RFP header / title block
s2_overview         text        Project overview section
s3_scope            text        Scope of work section
s4_regulatory       text        Regulatory requirements section
s5_deliverables     text        Deliverables section
s6_proposal_reqs    text        Proposal requirements section
s7_eval_criteria    text        Evaluation criteria section
s8_timeline         text        Timeline section
s9_terms            text        Terms and conditions section
s10_contact         text        Contact information section
completeness_score  integer     default 0  (0–100, how many sections are filled)
rfp_id              text        internal reference ID
status              text        default 'draft'  values: 'draft' | 'final'
created_at          timestamptz default now()
updated_at          timestamptz default now()
```
RLS: all operations restricted to own user_id.

---

## Admin Portal Tables

### admin_users
Gated admin accounts. Signup creates a row with approved=false; APP_ADMINISTRATOR
clicks an emailed approval link to activate.
```
id                        uuid        not null  PK  default gen_random_uuid()
user_id                   uuid        not null  FK → auth.users (cascade delete)  UNIQUE
email                     text        not null  UNIQUE
approved                  boolean     default false
approval_token            text
approval_token_expires_at timestamptz
created_at                timestamptz default now()
updated_at                timestamptz default now()
```
No RLS — admin routes use service role only.

---

## Email Infrastructure Tables

### notifications
In-app notification records — one per draft-ready event.
```
id            uuid        not null  PK  default gen_random_uuid()
user_id       uuid        not null  FK → auth.users (cascade delete)
engagement_id uuid        nullable  FK → cro_engagements.id (cascade delete)
draft_id      uuid        nullable  engagement_messages.id of the AI draft
type          text        not null  default 'draft_ready'
title         text        not null  e.g. "Response from Biotech Corp"
body_text     text        subtitle shown in notification list
read          boolean     not null  default false
created_at    timestamptz not null  default now()
```
RLS: SELECT and UPDATE restricted to own user_id. INSERT via service role only.
Index: (user_id, read, created_at DESC) WHERE read = false — fast unread count.

---

## Shared Trigger Function

`update_updated_at_column()` — sets `updated_at = now()` on every UPDATE.
Used by: rfp_internal_briefs, cro_engagements, biotech_user_settings, cro_user_settings.

## Immutability Trigger

`prevent_capture_mode_change()` on cro_engagements — raises exception if
`capture_mode` is modified after row creation. Enforces assisted/native as permanent.

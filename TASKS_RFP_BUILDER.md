# TASKS_RFP_BUILDER.md
# Feature: AI-Powered CRO Engagement Pipeline — Biotech/Pharma Buy-Side
# Version 2.0 — Full workflow: dump → safe outreach → email back-and-forth → meeting → RFP

## Strategic Context

This is NOT just an "RFP generator." It is the full CRO engagement lifecycle
tool for biotech/pharma companies, reflecting how these deals actually unfold:

  STAGE 1: Biotech dumps all internal knowledge (private, never leaves the app)
  STAGE 2: AI creates a sanitized "capability enquiry" — IP-safe, not a real RFP
  STAGE 3: Mass outreach to selected CROs (BIOSECURE filter, capability match)
  STAGE 4: CRO responses arrive → AI drafts replies → user approves → send
  STAGE 5: Promising CROs get a meeting invite via calendar link
  STAGE 6: Meeting notes pasted in → AI refines understanding, surfaces gaps
  STAGE 7: Full structured RFP generated and sent ONLY to shortlisted CRO(s)

Key constraint: the biotech's full internal research dump (compound identity,
mechanism, strategy) is NEVER sent to CROs. The system maintains a strict
separation between the private internal knowledge base and all outbound communications.

Database assumption: A comprehensive list of CRO data will exist in Supabase probably in a time with name, location,capabilities, contact email, BIOSECURE status, and specialties. This is populated
separately (Phase 2 of platform). All outreach tasks in this file assume that
data exists and is queryable. Build UI hooks now; wire to real data when ready.

---

## Product Principles
- The internal dump is a vault. Nothing from it goes outward without user review.
- Every outbound message requires explicit user approval before sending.
- The AI drafts, the human sends. Never auto-send without approval.
- KISS: the user sees one active engagement thread per CRO, not a complex CRM.
- Email is the communication channel. No new portal logins required for CROs.

---

## DATA MODEL — Read This Before Building Anything

```sql
-- The private internal knowledge dump (never sent to CROs)
create table rfp_internal_briefs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  title text,
  raw_inputs jsonb,                    -- {text, docs[], voice_transcript}
  extracted_data jsonb,                -- 12-field structured object from AI
  classification text,                 -- tox | pk | efficacy | in_vitro | etc
  status text default 'active',        -- active | archived
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CRO database (stub — populated separately in platform Phase 2)
create table cros (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  website text,
  contact_email text,
  contact_name text,
  city text,
  country text,
  region text,                         -- US | EU | UK | APAC | CN
  biosecure_compliant boolean default false,
  specialties text[],                  -- ['tox','pk','in_vivo','bioanalysis',etc]
  size_category text,                  -- small | mid | large
  glp_certified boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- One engagement = one biotech pursuing one CRO for one study need
create table cro_engagements (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  brief_id uuid references rfp_internal_briefs(id),
  cro_id uuid references cros(id),
  cro_name text,
  cro_email text,
  stage text default 'enquiry_draft',
  -- stages: enquiry_draft | enquiry_sent | response_received |
  --         followup_draft | followup_sent | meeting_scheduled |
  --         meeting_done | rfp_draft | rfp_sent | awarded | closed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Every message in the thread
create table engagement_messages (
  id uuid default gen_random_uuid() primary key,
  engagement_id uuid references cro_engagements(id) on delete cascade,
  direction text,                      -- outbound | inbound
  message_type text,                   -- enquiry | followup | meeting_invite | rfp | response
  subject text,
  body text,
  status text default 'draft',         -- draft | approved | sent | delivered | bounced
  sent_at timestamptz,
  delivered_at timestamptz,
  resend_message_id text,              -- Resend message ID for webhook matching
  ai_generated boolean default true,
  created_at timestamptz default now()
);

-- Meeting notes per engagement
create table engagement_meetings (
  id uuid default gen_random_uuid() primary key,
  engagement_id uuid references cro_engagements(id) on delete cascade,
  meeting_date date,
  attendees text,
  raw_notes text,
  ai_summary jsonb,                    -- {gaps_resolved, new_gaps, rfp_refinements, open_questions}
  created_at timestamptz default now()
);

-- RLS: users only see their own data
alter table rfp_internal_briefs enable row level security;
alter table cro_engagements enable row level security;
alter table engagement_messages enable row level security;
alter table engagement_meetings enable row level security;

create policy "Own briefs" on rfp_internal_briefs
  for all using (auth.uid() = user_id);
create policy "Own engagements" on cro_engagements
  for all using (auth.uid() = user_id);
create policy "Own messages" on engagement_messages
  for all using (
    engagement_id in (select id from cro_engagements where user_id = auth.uid())
  );
create policy "Own meetings" on engagement_meetings
  for all using (
    engagement_id in (select id from cro_engagements where user_id = auth.uid())
  );
```

---

## PHASE 1: Internal Knowledge Dump (Private Vault)

### TASK 1.1 — Multi-Format Input Intake
**What:** The user dumps everything they know about the study need. This is
completely private — it goes into rfp_internal_briefs and never leaves the app
without explicit user approval of each outbound message. Three input methods.

**Freeform text:**
- Large textarea, no required fields, 10,000 char limit
- Placeholder: "Dump everything you know — compound info, study type, timeline,
  budget, compliance needs, prior CRO experiences, constraints. This stays private."
- "PRIVATE — not shared with CROs" label clearly visible at top of page

**Document upload:**
- Drag-and-drop zone accepting PDF, DOCX, TXT, PPTX (up to 5 files)
- Parse and extract text server-side on upload
- Show "Document extracted: [filename]" confirmation chip for each uploaded file
- Extracted text appended to combined input for AI processing

**Voice input:**
- Microphone button using Web Speech API (Chrome/Edge)
- Live transcription displayed as user speaks
- Transcribed text appended to freeform textarea
- Max 3 minutes recording
- Graceful fallback message if browser unsupported: "Voice requires Chrome or Edge"

**Auto-save:** draft saves every 30 seconds to rfp_internal_briefs

**Eval criteria:**
- [ ] All three input methods work independently and in combination
- [ ] PDF upload extracts text from a 10-page study report without error
- [ ] DOCX upload extracts text from a 2-page brief without error
- [ ] Voice transcription appears in real time and is editable
- [ ] "PRIVATE — not shared with CROs" label visible on page
- [ ] Draft auto-saves and survives page refresh
- [ ] Up to 5 documents uploadable in one session
- [ ] Empty input state: "Generate" button disabled until at least 50 characters

---

### TASK 1.2 — AI Structured Extraction
**What:** Claude processes all inputs and extracts a structured internal brief
used to power all downstream features. Shown to user as a reviewable list before
any outreach begins.

**The 12 fields:**
1. Study objective
2. Study type (tox / PK / efficacy / in vitro / combination)
3. Specific assay type(s)
4. Drug/compound description (class, route — never name/structure)
5. Species/model
6. Group sizes and cohort design
7. Primary endpoints
8. Timeline requirements
9. GLP/compliance requirement
10. Key deliverables
11. Budget range
12. Special requirements / constraints

**Each field tagged:** [STATED] | [INFERRED] | [MISSING]
Do not invent content for [MISSING] fields.

**Review screen:** All 12 fields displayed in an editable grid. User can edit
any field inline. Title field (internal name for this brief) required.
"Confirm & Start CRO Search" button saves to Supabase and advances to Phase 2.

**Eval criteria:**
- [ ] Extraction completes in under 10 seconds for 1000-word input
- [ ] Returns valid JSON with all 12 fields (null for missing, not empty string)
- [ ] [STATED]/[INFERRED]/[MISSING] tags correctly applied across 10 test inputs
- [ ] User can edit any field inline before confirming
- [ ] Confirmed brief saves correctly with extracted_data populated
- [ ] Classification field correctly inferred for tox, PK, efficacy, in vitro inputs
- [ ] Compound name/structure excluded from extracted fields if present in input
  (mark as [SENSITIVE] not [STATED] — this field should not be in schema at all)

---

## PHASE 2: CRO Selection & IP-Safe Outreach

### TASK 2.1 — CRO Matching & Selection UI
**What:** Show user a filtered list of CROs matching the study type. User selects
which ones to contact.

**Filter controls:**
- **BIOSECURE only toggle** — default ON, prominent, labeled "BIOSECURE Act
  compliant — US/EU/UK only"
- **Study type match** — auto-filtered from brief classification
- **GLP required toggle** — appears only if brief has GLP=required
- **Region checkboxes** (US / EU / UK) — visible only when BIOSECURE toggle OFF
- **Size** (Small / Mid / Large / Any)

**CRO card fields:** name, city/country, specialties as tags, BIOSECURE badge,
GLP badge, size indicator, match score (rule-based capability overlap)

**Selection:** checkbox per card, "Select all filtered" and "Clear all" buttons

**Empty database fallback:** When cros table is empty, show:
"CRO database coming soon. Enter CRO email addresses manually to proceed."
Manual email + name entry (repeatable, add up to 20). This keeps the flow
working before the CRO database is populated.

**Eval criteria:**
- [ ] BIOSECURE toggle defaults ON and filters correctly
- [ ] GLP filter only appears when brief GLP requirement is not null
- [ ] Match score calculated correctly (specialties array overlap with classification)
- [ ] Multi-select checkboxes work, count shown: "3 CROs selected"
- [ ] Empty database state shows manual email entry without error
- [ ] Manual email entry validates email format
- [ ] "Proceed" button disabled until at least 1 CRO/email selected

---

### TASK 2.2 — IP-Safe Capability Enquiry Generator
**What:** The critical IP protection feature. The outbound message to CROs is
NOT the RFP. It is a sanitized capability enquiry — enough for the CRO to
confirm capability and availability without exposing the compound, MOA,
or strategic context.

**Safe to include in outreach:**
- General study type ("28-day repeat dose oral toxicology")
- Species and route of administration
- Approximate group sizes
- GLP / non-GLP requirement
- General timeline (e.g. "Q3 2025 start, 3-month duration")
- Deliverables needed
- Budget range (optional — user checkbox to include/exclude)
- Response deadline

**Never include in outreach (hard filter):**
- Compound name, structure, or class
- Mechanism of action
- Disease indication
- Internal study ID or program name
- Strategic rationale for the study
- Prior study results
- Budget if user opts out

**AI prompt:**
```
You are drafting an IP-safe capability enquiry email on behalf of a biotech company.
This is initial outreach to determine if the CRO has capability and capacity.
It is NOT the full RFP.

Rules:
1. NEVER include compound name, mechanism of action, or disease indication.
2. Include ONLY: study type, species, route, group sizes, compliance requirement,
   timeline, deliverables, and budget range (only if include_budget=true).
3. Keep to 200-300 words maximum.
4. Professional tone. Clear ask: confirm capability, estimated start availability,
   rough budget range, and respond by [deadline].
5. Do not include any information marked [SENSITIVE] or [MISSING].

Brief safe fields: {safe_fields}
CRO name: {cro_name}
Include budget: {include_budget}
Response deadline: {deadline}
```

**UI layout:** Two-column preview.
Left: checklist of what IS and IS NOT included from brief (with colour coding).
Right: editable draft email.
"Approve" button per CRO, or "Approve all identical" for batch send.
Personalization: each CRO gets their own name in the greeting.

**Eval criteria:**
- [ ] Generated message contains NO compound name, MOA, or indication — tested
  against 10 briefs that explicitly include these in the internal dump
- [ ] Message is 200-300 words
- [ ] Budget included/excluded based on checkbox
- [ ] "What's included" checklist accurately reflects message content
- [ ] Each CRO's message is personalized with their name
- [ ] Batch approve creates separate engagement_messages records per CRO
- [ ] User must explicitly click "Approve & Send" — no auto-send under any circumstances
- [ ] After approval, engagement stage → 'enquiry_sent'

---

### TASK 2.3 — Email Sending via Resend (Baseline Feature — Not Future)
**What:** Send approved outbound emails directly from the platform. No copy-paste,
no launching external email clients. The user clicks "Approve & Send" and the
email is delivered immediately. This applies to ALL outbound message types:
capability enquiries, follow-ups, meeting invites, and full RFPs.

**Sending architecture — no DNS setup, no OAuth required:**
- From address: platform address e.g. `outreach@[platform-domain].com`
  (no custom domain DNS records required from the user)
- Reply-To: user's email address (stored in settings as sender_email)
  This means CRO replies land directly in the user's own inbox automatically,
  not in the platform. The CRO sees "from BiotechOS on behalf of [User Name]"
  and replies go to the user — exactly like Lemlist, Superhuman, and Instantly.
- Display name in From field: "[User Name] via BiotechOS"
  so CROs see a real person's name, not a generic platform address.

**Per-send implementation:**
- On "Approve & Send": call Resend API with:
  - `from`: `"[User Display Name] via BiotechOS <outreach@platform-domain.com>"`
  - `reply_to`: user's email from settings
  - `to`: CRO contact email from engagement record
  - `subject`: generated subject line (see below)
  - `html`: formatted email body (plain text converted to simple HTML)
- Subject line format by message type:
  - Capability enquiry: "Preclinical [study_type] capability enquiry — [Company name]"
  - Follow-up: "Re: Preclinical [study_type] capability enquiry — [Company name]"
  - Meeting invite: "Meeting request — [study_type] study — [Company name]"
  - Full RFP: "RFP: Preclinical [study_type] study — [Company name] — [RFP ID]"
- On success: update engagement_messages status → 'sent', sent_at → now()
- On failure: show user-facing error toast with retry button; do NOT silently fail

**Delivery tracking via Resend webhooks:**
- Register Resend webhook endpoint at `/api/webhooks/resend`
- Listen for `email.delivered` and `email.bounced` events
- Update engagement_messages with delivery status
- Show per-CRO status in engagement list: "Delivered ✓" / "Bounced ✗" / "Sending..."
- Bounced addresses show a warning banner on the engagement: "Email bounced —
  check the address and resend"

**Settings prerequisite (links to Task 8.1):**
- User must have sender_display_name and sender_email saved in settings
- If either is missing when user tries to send: show inline prompt to complete
  settings first. Do not block RFP creation — only block the send action.

**Eval criteria:**
- [ ] Capability enquiry email delivered to test Gmail inbox with correct content
- [ ] From field shows "[User Name] via BiotechOS <outreach@...>" (not raw address)
- [ ] Reply-To is user's email — confirmed by replying to test email in Gmail
  and verifying reply lands in user's inbox, not platform inbox
- [ ] Subject line follows correct format for each message type (4 types tested)
- [ ] Batch send (multiple CROs) fires separate Resend API calls per CRO
- [ ] Each send updates engagement_messages.status and sent_at correctly
- [ ] Resend webhook receives delivery event and updates status to "Delivered ✓"
- [ ] Bounced email shows warning banner on the engagement record
- [ ] Send failure (Resend API error) shows toast with retry button, does not crash
- [ ] Missing sender settings shows inline prompt, does not hard-block the UI
- [ ] Full RFP email body renders correctly in Gmail (no broken formatting)
- [ ] Long RFP body (2000+ words) sends without truncation (no mailto: character limits)

---

## PHASE 3: Response Tracking & AI-Assisted Follow-Up

### TASK 3.1 — Engagement Thread View
**What:** A threaded conversation view for each CRO engagement showing all
messages (outbound and inbound) in chronological order.

**Layout:**
- Left sidebar: list of all engagements with stage pill and last-activity date
  Grouped by brief title
- Right panel: full thread for selected engagement
- Messages colour-coded: blue background = outbound, white = inbound
- Stage pill at top of thread
- Action bar: context-sensitive button for current stage

**Inbound response logging (manual in Phase 1, Gmail OAuth in future):**
- "Log CRO response" button opens modal
- User pastes CRO's email reply text
- Saves as engagement_messages with direction='inbound'
- Stage → 'response_received'
- AI follow-up draft triggers automatically (Task 3.2)

**Eval criteria:**
- [ ] Sidebar shows all engagements grouped by brief
- [ ] Stage pills correct for all stages
- [ ] Messages render in correct chronological order
- [ ] Inbound paste modal saves correctly and updates stage
- [ ] AI draft triggers within 3 seconds of inbound save
- [ ] Empty thread: helpful placeholder, no blank screen
- [ ] Thread scrolls to latest message automatically

---

### TASK 3.2 — AI Auto-Draft Follow-Up
**What:** After a CRO response is logged, Claude analyses it against the brief
and drafts three outputs: a reply email, a gap analysis, and suggested questions.

**Three outputs from one Claude call:**

Output A — Gap analysis (internal, not sent):
- What did the CRO confirm that was in the brief requirements?
- What did they not address?
- Any concerns raised by their response?

Output B — Draft reply email (200-250 words):
- Acknowledge what they confirmed
- Ask specific clarifying questions based on gaps
- NO new IP from the brief in the reply
- Professional tone

Output C — Suggested questions for the biotech (displayed as checkboxes):
These are advisory questions the scientist should consider asking, displayed
separately from the email draft. Checking one inserts it into the draft.
Examples: "Their timeline of 10 weeks seems optimistic for 4 cohort groups —
confirm bench availability", "No mention of SEND dataset capability — ask if
they can deliver this"

**Context passed to Claude:** the brief's 12 extracted fields + the full
thread of prior messages in this engagement (up to last 5 messages or 8,000
tokens, whichever is smaller).

**UI:** Two panels side by side.
Left: gap analysis + suggested questions as checkboxes.
Right: editable draft email.
Checking a suggested question inserts it into draft naturally.
"Approve & Send" button.

**Eval criteria:**
- [ ] Draft generated within 10 seconds of inbound response being logged
- [ ] Draft contains NO compound name, MOA, or indication
- [ ] Gap analysis correctly identifies confirmed vs unaddressed requirements
- [ ] Suggested questions are specific to this CRO's response (not generic)
- [ ] Checking a question inserts it into email draft coherently
- [ ] Draft fully editable before approval
- [ ] Approved reply sends via Resend using Task 2.3 architecture
  (platform From, Reply-To = user email), stage → 'followup_sent'
- [ ] Multiple rounds supported: third round draft does not re-ask
  questions already answered in prior messages

---

### TASK 3.3 — Multi-Round Thread Management
**What:** Support unlimited back-and-forth rounds without context loss or
repetition in AI drafts.

**Implementation:**
- Pass full message history (up to 5 messages) to Claude as context on each call
- For threads longer than 5 messages: summarise older messages first, then pass
  summary + last 3 messages
- "Resolved" toggle on each gap item in the gap analysis panel
- Running "Still need to know" list in thread sidebar, updated as gaps resolved
- Thread renders correctly with 10+ messages

**Eval criteria:**
- [ ] Fourth-round AI draft does not re-ask questions answered in messages 1-3
- [ ] "Still need to know" list updates when items marked resolved
- [ ] Thread renders without degradation at 10+ messages
- [ ] Context summarisation fires correctly for threads over 5 messages
  (verify by checking what's passed in Claude API call)

---

## PHASE 4: Meeting Scheduling

### TASK 4.1 — Calendar Link in Meeting Invite
**What:** When user wants a call with a CRO, send a short email with their
booking link. No calendar API integration — just a URL in an email.

**Implementation:**
- "Schedule meeting" button visible on engagements at stage 'followup_sent' or later
- Check user settings for scheduling_link (Calendly, Cal.com, etc.)
- If no link: "Add your booking link in settings" prompt with link
- If link exists: AI drafts short meeting invite (100-150 words):
  "Thanks for your responses. I'd like a 30-minute call to discuss requirements.
  Book a time here: [link]"
- Editable before approval
- Send via Resend using Task 2.3 architecture
  (platform From address, Reply-To = user email) → stage → 'meeting_scheduled'

**Settings field:** scheduling_link stored in user profile (see Task 8.1)

**Eval criteria:**
- [ ] Button only visible at correct stage
- [ ] Settings prompt shown when no link configured
- [ ] AI draft includes link correctly and is 100-150 words
- [ ] Booking link is a working hyperlink in the delivered email (test in Gmail)
- [ ] Stage → 'meeting_scheduled' after send

---

## PHASE 5: Meeting Debrief & RFP Refinement

### TASK 5.1 — Meeting Notes Ingestion
**What:** After the external call, user pastes notes or AI transcript
(Otter.ai, Zoom AI, Fireflies, etc). Any format accepted.

**Implementation:**
- "Log meeting notes" button on engagements at stage 'meeting_scheduled'
- Full-screen textarea: "Paste your meeting notes or call transcript here"
- No format requirements — raw transcript, bullets, or prose all accepted
- Save to engagement_meetings.raw_notes
- Trigger AI processing (Task 5.2) automatically
- Stage → 'meeting_done'

**Eval criteria:**
- [ ] Any text format accepted without validation error
- [ ] Notes saved to engagement_meetings correctly
- [ ] Stage → 'meeting_done' after save
- [ ] AI analysis (Task 5.2) triggers automatically
- [ ] Button only visible at correct stage

---

### TASK 5.2 — AI Meeting Debrief Analysis
**What:** Claude analyses meeting notes against the internal brief and produces
four structured outputs saved to engagement_meetings.ai_summary.

**Four outputs:**

1. Gaps resolved: which previously open questions were answered in the call?
   (Used to update the "still need to know" list)

2. New concerns: anything from the meeting that raises red flags or new questions?
   (e.g. "CRO mentioned GLP certification renewal pending — verify before contracting")

3. RFP refinements: what should change in the eventual RFP based on what was learned?
   (e.g. "CRO can only run 3 cohort groups, not 4 — adjust group design")

4. Remaining open questions: what still needs to be resolved before sending the RFP?
   Shown as a checklist the user can action before proceeding to RFP generation.

**Display:** Debrief view with four collapsible sections.
Each item in sections 3 and 4 has an "Add to RFP" action that pre-populates
a note in the RFP builder context for that engagement.

**Eval criteria:**
- [ ] All four sections populated from a 500-word test transcript
- [ ] Gaps resolved correctly cross-referenced against prior engagement messages
- [ ] RFP refinements are specific and actionable (not generic)
- [ ] Remaining open questions specific to this CRO and study
- [ ] "Add to RFP" action saves refinement note to engagement record
- [ ] Processing completes in under 15 seconds

---

## PHASE 6: Full RFP Generation & Delivery

### TASK 6.1 — Full RFP Generator
**What:** Generates the full structured RFP using all accumulated context:
original brief + email thread gaps + meeting refinements + any manual edits.

**10 RFP sections:**
1. RFP Header (ID, date, company, contact)
2. Study Overview (objective, scientific background — 1 paragraph)
3. Scope of Work (full technical requirements — most detailed section)
4. Regulatory Requirements (GLP, compliance framework, report standards)
5. Deliverables (exact list with format and due dates)
6. Proposal Requirements (what CRO response must contain)
7. Evaluation Criteria (how biotech will score CRO responses)
8. Proposal Timeline (submission deadline, questions deadline, award date)
9. Terms and Confidentiality (NDA reminder, IP/data ownership clause)
10. Contact and Submission Instructions

**Context fed to Claude:**
- rfp_internal_briefs.extracted_data (all 12 fields)
- engagement_messages (full thread, last 10 messages)
- engagement_meetings.ai_summary (all refinements)
- Any "Add to RFP" notes from meeting debrief

**Rules:** Where fields are [MISSING] → insert [TO BE SPECIFIED] in bold.
Do not invent content. Scope of Work must reflect meeting refinements.

**Display:** Live editable document. Per-section regeneration available.
Completeness score (0-100, rule-based) visible throughout.

**Eval criteria:**
- [ ] All 10 sections generated for a complete brief + thread + meeting notes
- [ ] Scope of Work accurately reflects meeting refinements (not just the original brief)
- [ ] [TO BE SPECIFIED] correctly placed for any still-missing fields
- [ ] No contradiction between brief, thread history, and RFP content
- [ ] Per-section regeneration works independently
- [ ] Completeness score calculates correctly

---

### TASK 6.2 — RFP Approval & Send
**What:** User reviews RFP and sends to the CRO. Confirmation required.

**Implementation:**
- "Send RFP to [CRO name]" with confirmation dialog:
  "You are sending the full RFP to [CRO name]. This contains full study scope
  details. Confirm?"
- On confirm: save to engagement_messages, send via Resend using Task 2.3
  architecture (platform From address, Reply-To = user email), stage → 'rfp_sent'
- RFP body sent as formatted HTML email; long RFP bodies (2000+ words) fully
  supported — no truncation risk since we are not using mailto:
- PDF and DOCX export available as alternatives to email send
- "Send to all shortlisted CROs" button if multiple engagements from same brief
  are at 'meeting_done' (sends separate email per CRO)
- Warning (not block) if completeness score below 60

**Eval criteria:**
- [ ] Confirmation dialog appears before every send
- [ ] RFP delivered via Resend with all 10 sections intact
- [ ] Stage → 'rfp_sent' after send
- [ ] PDF export generates without errors, all sections present
- [ ] "Send to all shortlisted" sends separate emails (separate Resend calls)
- [ ] Low completeness score shows warning with option to continue anyway

---

## PHASE 7: Pipeline Dashboard & Navigation

### TASK 7.1 — Engagement Pipeline Dashboard
**What:** Main view showing all active CRO engagements across all briefs,
organised by stage. Lightweight pipeline, not a full CRM.

**Layout:** Sortable table (not kanban — simpler to build, easier to scan):
Columns: CRO name | Brief title | Stage | Days since last activity | Next action

**Stage filter tabs** at top: All | Active | Awaiting response | Meeting | RFP stage | Closed

**Quick action per row** matching current stage:
- enquiry_draft → "Send enquiry"
- response_received → "Draft reply"
- followup_sent → "Schedule meeting" / "Log response"
- meeting_scheduled → "Log meeting notes"
- meeting_done → "Generate RFP"
- rfp_sent → "Mark awarded" / "Mark closed"

**Brief grouping toggle:** show all engagements flat, or group by brief.

**Eval criteria:**
- [ ] All engagements for current user displayed correctly
- [ ] Stage filter tabs work correctly
- [ ] Days since last activity calculated correctly
- [ ] Quick action buttons match stage and navigate to correct screen
- [ ] Brief grouping toggle works
- [ ] Empty state shows "Create your first study brief" CTA

---

### TASK 7.2 — Routes and Navigation
**Routes:**
- /briefs — list of all internal briefs
- /briefs/new — intake flow (Phase 1)
- /briefs/[id] — view/edit brief + list its engagements
- /engagements — pipeline dashboard (Task 7.1)
- /engagements/[id] — single engagement thread view

**Navigation:** "New Brief" and "Engagements" in main nav.
Breadcrumbs on all pages. Unsaved changes warning on navigate away.

**Eval criteria:**
- [ ] All 5 routes load without errors
- [ ] Breadcrumbs correct on all routes
- [ ] Back navigation preserves state
- [ ] Unsaved changes warning fires correctly

---

## PHASE 8: Settings Additions

### TASK 8.1 — User Settings for This Feature
**Five new fields to add to existing settings page:**

1. Scheduling link — "Your meeting booking URL (Calendly, Cal.com, etc.)"
   URL field with validation.
2. Sender display name — "Your name as shown in outreach emails"
   Text field, default from auth profile name.
3. Sender email — "Your email address (CRO replies will go here)"
   Email field, default from auth profile email. This becomes the Reply-To
   on all platform-sent emails. Required before any email can be sent.
4. Company name — used in RFP header and email signatures.
   Text field.
5. Default response deadline — days to give CROs to respond.
   Select: 5 / 10 / 15 / 20 days. Default: 10.

**Eval criteria:**
- [ ] All 5 fields save and retrieve correctly
- [ ] Scheduling link validated as URL format
- [ ] Sender email validated as valid email format
- [ ] Sender email is used as Reply-To on all Resend API calls (confirmed by
  test: reply to a sent email and verify it lands at the sender_email address)
- [ ] Company name appears in generated RFP header
- [ ] Default deadline used in all outreach message drafts
- [ ] If sender_email is empty and user tries to send any email, show inline
  prompt: "Add your email address in settings to enable sending" with settings link

---

## OUT OF SCOPE FOR THIS PHASE

The following belong in a future TASKS file:

- Gmail OAuth: auto-capture of inbound CRO reply emails (currently manual paste)
- Response comparison: AI ranking of multiple CRO proposals against same RFP
- CRO database population: scraping and curating CROs into the cros table
- Calendly/Cal.com API: reading actual calendar availability
- E-signatures on final RFP: DocuSign / HelloSign integration
- Win/loss analytics and CRO performance scoring
- Multi-user collaboration on briefs
- Automated counter-question to CRO RFP responses

---

## CLAUDE.md ADDITIONS NEEDED
Add before starting build:
- New routes: /briefs/* and /engagements/*
- New Supabase tables: rfp_internal_briefs, cro_engagements,
  engagement_messages, engagement_meetings, cros (stub, empty initially)
- New user settings fields: scheduling_link, sender_display_name,
  sender_email, company_name, response_deadline_days
- Email sending via Resend (already integrated): ALL outbound emails use
  From = `"[User Display Name] via BiotechOS <outreach@[platform-domain].com>"`
  and Reply-To = user's sender_email from settings. No custom DNS setup required.
  No mailto: links anywhere — all email sends go through Resend API directly.
  Resend webhook endpoint at /api/webhooks/resend for delivery/bounce tracking.
- Web Speech API for voice input (browser-native, no API key)
- AI calls: claude-sonnet-4-6, max_tokens 2000 for drafts, 3000 for full RFP
- CRITICAL constraint: rfp_internal_briefs.extracted_data fields for
  compound identity, MOA, and indication are NEVER passed to any outbound
  message generation prompt — enforced at the prompt level in Task 2.2

## ACTIVE FILES
- This file: TASKS_RFP_BUILDER.md
- CRO sell-side parallel build: TASKS_QUICKQUOTE.md
- Completed phases renamed DONE_TASKS_RFP_BUILDER_Pn.md per project convention
- Do not modify DONE_ prefixed files

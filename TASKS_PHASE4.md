---

## Phase 4 — Monetisation, Virality & Intelligence

## How Claude Code should use this file
Read CLAUDE.md first, then this file.
All files prefixed with DONE_ are completed and 
should be ignored entirely.Find the first task marked [ ] in this file.
Build it completely. Run every eval criterion.
Mark passing evals [x] and report failures.
Do not move to the next task until all evals pass.
Always wait for human approval before next task.

---

### Task 27 — Professional transactional email 
              via Resend (fix Supabase emails) [ ]

Replace all Supabase default auth emails with
branded emails sent through Resend so every
touchpoint looks professional from day one.

Supabase sends these emails by default using
their own domain and generic templates:
- Confirm signup
- Magic link login
- Password reset
- Email change confirmation

We will override all of them.

Step 1 — Disable Supabase default emails:
Go to Supabase dashboard →
Authentication → Email Templates.
For each template type, replace the default
content with a redirect to your own API route
that handles the action AND sends the branded
email via Resend.

Update Supabase Auth settings:
- Site URL: your production URL
- Redirect URLs: add your production URL 
  and localhost:3000

Step 2 — Create branded email templates in
/lib/email-templates.ts for:

Template: confirm-signup
Subject: "Confirm your CRO RFP Tool account"
Body:
- Clean header with your logo/product name
- "Welcome to CRO RFP Tool" heading
- One sentence on what the product does
- Large CTA button: "Confirm my account"
- Button links to: 
  /api/auth/confirm?token={token}&type=signup
- Footer: "If you didn't create an account 
  you can safely ignore this email."

Template: password-reset  
Subject: "Reset your CRO RFP Tool password"
Body:
- "Password reset requested" heading
- "Click below to reset your password.
   This link expires in 1 hour."
- CTA button: "Reset password"
- Footer: "If you didn't request this,
  your account is safe — ignore this email."

Template: magic-link
Subject: "Your login link for CRO RFP Tool"
Body:
- "Here's your login link" heading  
- "This link expires in 10 minutes and 
   can only be used once."
- CTA button: "Log in now"

Template: email-change
Subject: "Confirm your new email address"
Body:
- "Email change requested" heading
- Show old email → new email
- CTA button: "Confirm new email"
- "If you didn't request this change, 
   contact support immediately."

Template: team-invitation (already in Task 26
— ensure it uses same design system as above)

Template: welcome (send after email confirmed)
Subject: "You're in — here's how to get 
          your first proposal done in 1 hour"
Body:
- "Welcome to CRO RFP Tool" heading
- 3-step onboarding checklist with links:
  Step 1: Complete your CRO profile (link)
  Step 2: Upload your first RFP (link)
  Step 3: Generate your first proposal (link)
- Estimated time: "Takes about 60 minutes 
  the first time, 45 minutes for every 
  proposal after that."
- CTA button: "Get started"

Step 3 — Create auth callback API routes:
/api/auth/confirm
- Accepts token and type query params
- Calls Supabase to verify the token
- On success: redirect to /dashboard
- On failure: redirect to /auth/error 
  with helpful message
- After successful signup confirm: 
  send welcome email via Resend

Step 4 — Design system for all emails:
Create a base email layout wrapper in
/lib/email-templates.ts that all templates
use. Ensures consistent look:
- White background, max-width 600px centred
- Product logo or name in top header bar
  with subtle background colour
- Clean sans-serif font (system fonts only
  for email compatibility)
- Single prominent CTA button per email
  (no competing links)
- Footer with: product name, support email,
  unsubscribe link, legal address placeholder
- Mobile responsive (inline CSS only —
  no external stylesheets in email)

**Eval criteria:**
- [ ] All 6 email templates render valid HTML
      (preview each in Resend dashboard)
- [ ] Confirm signup email sends from your 
      domain (not @supabase.co)
- [ ] Password reset email sends and link works
- [ ] Welcome email sends after confirmation
- [ ] All emails render correctly on mobile
      (use Resend preview tool to verify)
- [ ] All emails use consistent design system
- [ ] No broken images or layout shifts
- [ ] /api/auth/confirm handles valid token
- [ ] /api/auth/confirm handles expired token
      with friendly error page
- [ ] Supabase default emails no longer send
      (verify by checking Supabase email logs)

---


### Task 30 — AI-powered profile pre-fill 
              from company documents [ ]

Allow CROs to upload their existing company
documents (capability statements, brochures,
previous proposals, website text) and have
the AI automatically populate their profile
fields — eliminating the blank-form problem.

Add an "Auto-fill from documents" button to
the top of the profile page. When clicked,
show a modal with:
- File upload area accepting:
  .pdf, .docx, .txt, .html (max 5 files, 
  max 10MB each)
- Text paste area: "Or paste your website 
  text or company description here"
- Helper text: "Upload any of these: 
  capability statement, previous proposals,
  company brochure, website about page"
- "Extract profile" button

Create API route: POST /api/profile/autofill
- Accepts files and/or pasted text
- Extracts text from uploaded files
- Concatenates all text into one context block
  (truncate to 8000 tokens if too long —
   prioritise the beginning of each document)
- Calls Claude API with extraction prompt:
System: You are extracting CRO company profile
information from documents. Return ONLY valid JSON.
Be conservative — only extract information that is
clearly stated. Never invent or assume details.
If a field is not mentioned return null.
User: Extract CRO profile information from these
documents and return as JSON matching exactly
this structure:
{
"company_name": "exact company name or null",
"company_overview": "2-3 sentence summary
of what the company does, in their voice
if possible, or null",
"therapeutic_areas": ["only areas explicitly
mentioned — pick from: oncology, CNS,
cardiovascular, infectious disease,
rare disease, immunology, metabolic,
respiratory, other"],
"assay_types": ["only assays explicitly
mentioned — pick from: in vitro toxicology,
DMPK/PK studies, safety pharmacology,
in vivo efficacy, organoid studies,
bioanalysis, histopathology, other"],
"team_members": [
{
"name": "full name or null",
"title": "job title or null",
"years_experience": number or null,
"expertise": "brief expertise summary
or null"
}
],
"facility_description": "description of
facilities, equipment, and capacity
mentioned or null",
"accreditations": ["only explicitly mentioned
— pick from: GLP, AAALAC, ISO 17025,
CAP, other"],
"geographic_reach": "locations or regions
mentioned or null"
}
Documents:
{document_text}

After extraction, show a review modal:
- Side by side: extracted values (left) vs 
  current profile values (right)
- Each field has a checkbox: 
  "Use extracted value" (checked by default 
   if field is currently empty)
- If field already has a value: 
  checkbox unchecked by default with note
  "This field already has a value"
- "Apply selected fields" button
- "Cancel" button

After applying, navigate directly to the 
profile form with extracted values pre-filled
and fields highlighted in amber to show 
what was auto-filled (fades after 3 seconds).

Also pre-fill pricing from documents:
If any pricing information is found in the
documents (e.g. "our DMPK studies start at
$X per sample") extract it and offer to
pre-fill the cro_assay_pricing table too.

Create a separate extraction for pricing:
Extract any pricing information mentioned.
Return as JSON:
{
"pricing_found": boolean,
"prices": [
{
"assay_type": "match to known assay types",
"price_per_sample": number or null,
"price_notes": "any context or null"
}
]
}

If pricing found, show a second section in
the review modal: "Pricing information found"
with option to apply to the pricing section.

**Eval criteria:**
- [ ] "Auto-fill from documents" button visible 
      on profile page
- [ ] Modal opens with file upload and text paste
- [ ] Accepts PDF, DOCX, TXT, HTML files
- [ ] Rejects files over 10MB with clear error
- [ ] API extracts text from uploaded PDF
- [ ] API extracts text from uploaded DOCX
- [ ] Claude API returns valid JSON matching schema
- [ ] Null returned for fields not mentioned 
      (test with a document missing some fields)
- [ ] Review modal shows extracted vs current values
- [ ] Checkboxes default correctly 
      (checked if empty, unchecked if has value)
- [ ] "Apply selected fields" populates the form
- [ ] Applied fields highlighted in amber
- [ ] Profile saves correctly after auto-fill
- [ ] Pricing extraction works when prices mentioned
- [ ] Pricing pre-fills cro_assay_pricing table
- [ ] Pricing section shows pre-filled values

---


              win/loss detection [ ]

Connect the CRO's email account so the app can
scan incoming emails and automatically flag
likely win/loss outcomes for human confirmation.
Never auto-confirm — always require one click.

This requires OAuth email access. Build for
Gmail first (largest user base) with a 
placeholder for Outlook.

Step 1 — Gmail OAuth connection:

Add Google OAuth credentials to .env.local:
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

Add email connection table:
```sql
create table connected_emails (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations,
  provider text not null 
    check (provider in ('gmail','outlook')),
  email_address text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table email_matches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations,
  rfp_id uuid references rfps,
  proposal_id uuid references proposals,
  gmail_message_id text,
  sender_email text,
  subject text,
  snippet text,
  detected_outcome text
    check (detected_outcome in 
      ('likely_won','likely_lost',
       'needs_clarification','follow_up_needed')),
  confidence_score integer,
  is_confirmed boolean default false,
  confirmed_outcome text,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);
```

Add "Connect Gmail" button to /settings/email
or as a prompt on the dashboard:
"Connect your inbox to automatically track 
 proposal outcomes — saves manual logging"

OAuth flow:
- Request Gmail scope: 
  gmail.readonly (read-only, not send access)
- Store tokens securely in connected_emails
- Show connected status and email address
- Allow disconnect at any time

Step 2 — Email scanning logic:

Create a cron job at /api/cron/scan-emails
running every 4 hours:

For each organisation with an active connected
email and proposals in 'submitted' status:
1. Fetch emails from the last 30 days where
   sender domain matches known biotech domains
   from that org's RFPs
2. For each matching email, call Claude API
   with classification prompt:
   System: You are analysing email communications
  to detect win/loss signals for CRO proposals.
  Return ONLY valid JSON. Be conservative —
  only flag high-confidence signals.
  User: Analyse this email and determine if it
  indicates a proposal outcome.
  Known proposals this CRO has submitted:
  {proposals_summary}
  Email details:
  From: {sender}
  Subject: {subject}
  Body snippet: {snippet}
  Return:
  {
  "is_relevant": boolean,
  "related_proposal_id": "uuid or null",
  "detected_outcome": "likely_won" |
  "likely_lost" | "needs_clarification" |
  "follow_up_needed" | "not_relevant",
  "confidence_score": 0-100,
  "reasoning": "one sentence explanation",
  "suggested_action": "what the CRO should do"
  }

  3. If is_relevant and confidence > 70:
   Create email_matches record
   Show notification on dashboard:
   "We detected a possible outcome for your 
    [Biotech Name] proposal — confirm it"

Step 3 — Outcome confirmation UI:

Add an "Inbox signals" section to the dashboard
showing unconfirmed email matches:

For each match:
- Sender and subject of the email
- Which proposal it relates to
- Detected outcome (Won / Lost / Needs follow-up)
- Confidence percentage
- Claude's reasoning in one sentence
- Two buttons: 
  "Yes, [outcome]" → confirms and updates proposal
  "Not this" → dismisses the match

Confirmed outcomes automatically update the
proposal's outcome field (from Task 22).

**Eval criteria:**
- [ ] connected_emails table created
- [ ] email_matches table created
- [ ] "Connect Gmail" button visible in settings
- [ ] OAuth flow completes and stores tokens
- [ ] Connected email shows in settings
- [ ] Disconnect removes tokens from DB
- [ ] Cron job runs without errors
- [ ] Email scan fetches emails for connected orgs
- [ ] Claude classification returns valid JSON
- [ ] Matches with confidence > 70 create records
- [ ] Dashboard shows unconfirmed matches
- [ ] Confirm button updates proposal outcome
- [ ] Dismiss button removes match from view
- [ ] Cron protected with CRON_SECRET
- [ ] Handles expired OAuth token gracefully
      (prompts user to reconnect)
- [ ] Gmail readonly scope only 
      (verify in Google Cloud Console)

---



## All Phase 4 tasks complete


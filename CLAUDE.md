# BiotechOS — Project Intelligence

## Active build plan
TASKS_RFP_BUILDER.md is the only active build plan.
All files prefixed with DONE_ are completed and should be ignored entirely.

---

## OFF LIMITS — Read this first
- app/(cro)/ is a shipped product. Never read, edit, or reference files
  inside it unless explicitly told to. This includes all components,
  routes, and lib files that are only used by the CRO product.
- DONE_*.md and *_POSTPONE.md files are archived. Never read them unless explicitly asked.

---

## What this product is

BiotechOS is a two-sided platform connecting biotech/pharma companies
with preclinical Contract Research Organizations (CROs).

It has two distinct products built for two distinct user personas:

### Product 1 — CRO Proposal Engine (SHIPPED — do not touch)
Helps small preclinical CROs respond to incoming RFPs and quote requests
faster. Cuts proposal time from 30+ hours to 3 hours.
- Lives in: app/(cro)/
- Status: shipped and in production
- Active users: CRO BD directors and proposal writers

### Product 2 — Biotech CRO Engagement Pipeline (CURRENTLY BUILDING)
Helps biotech/pharma companies find, evaluate, and engage CROs for
preclinical studies. Handles the full workflow from internal brief to
final RFP delivery — with IP protection built in at every step.
- Lives in: app/(biotech)/  ← being built now
- Status: in development
- Active task file: TASKS_RFP_BUILDER.md
- Target users: scientists, CSOs, and BD leads at small/mid biotech companies

---

## Domain knowledge

### The CRO world
- CROs = Contract Research Organizations. They run lab experiments for
  biotech/pharma companies under contract.
- RFP = Request for Proposal. A biotech sends this to CROs asking them
  to bid on running a preclinical study.
- Key assay types: in vitro toxicology, DMPK/PK, safety pharmacology,
  in vivo efficacy, organoid studies, bioanalysis, histopathology.
- Key accreditations: GLP (Good Laboratory Practice), AAALAC, ISO 17025.
- GLP studies are required for IND-enabling work (regulatory submission).
  Non-GLP studies are exploratory. This distinction affects cost 3-5x.

### The biotech engagement workflow (how deals actually happen)
Biotech companies do NOT send formal RFPs to unknown CROs immediately.
The real workflow is staged and IP-protective:
1. Internal brief created (private — never shared with CROs)
2. IP-safe capability enquiry sent to multiple CROs (no compound info)
3. CRO responses received → AI drafts follow-up questions
4. Promising CROs get a meeting/call
5. Meeting notes processed → RFP refined
6. Full RFP sent ONLY to shortlisted CROs

This staged disclosure is the core design principle of Product 2.
The internal brief is a vault. Nothing leaves it without user approval.

### BIOSECURE Act context
79% of US biotechs currently use China-based CROs. The BIOSECURE Act
is forcing rapid reshoring to US/EU providers. This creates urgent demand
for finding non-China CROs quickly — a key use case for Product 2.

---

## Tech stack
- Framework: Next.js 14 (App Router)
- Auth + DB: Supabase
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Styling: Tailwind CSS
- Email: Resend (already integrated)
- PDF export: Puppeteer (backend)
- Hosting: Vercel (frontend) + Supabase (backend/DB)

---

## Email sending architecture (applies to ALL outbound emails)
All platform emails use Resend with this pattern — do not deviate:
- From: "{{sender_display_name}} via BiotechOS <outreach@[platform-domain].com>"
- Reply-To: user's sender_email from settings
- No custom DNS setup required from users
- Log all sends to the existing email_logs table
- Resend webhook at /api/webhooks/resend updates delivery/bounce status

This means CRO replies land directly in the user's own inbox automatically.
No copy-paste. No mailto: links. Direct Resend API call on approval.

---

## Claude API rules
- Model: claude-sonnet-4-6 for all calls
- max_tokens: 2000 for message drafts, 3000 for full RFP generation
- Generate each proposal/RFP section as a SEPARATE API call so sections
  can be regenerated independently
- RFP parsing and extraction returns structured JSON only — no prose
- System prompt for CRO proposal generation (Product 1 — do not change):
  "You are an expert preclinical CRO proposal writer with 15 years of
  experience writing winning proposals for biotech and pharma sponsors.
  Your writing is precise, scientific, and persuasive. You never use
  generic filler text."
- System prompt for biotech outreach drafting (Product 2):
  "You are helping a biotech company communicate with CROs professionally.
  Write concise, clear, scientific emails. Never include compound names,
  mechanisms of action, or disease indications in outreach messages unless
  explicitly told the user has approved sharing this information."

### CRITICAL IP constraint for Product 2
The rfp_internal_briefs.extracted_data contains sensitive fields including
compound identity, MOA, and indication. These fields must NEVER be passed
to any outbound message generation prompt. Enforce this at the prompt
construction level in every function that generates outbound content.

---

## Database
Read SCHEMA_SNAPSHOT.md for all table definitions.
Do NOT read individual migration files to understand schema.
Do NOT modify existing CRO-side tables (see OFF LIMITS above).
New biotech-side tables are defined in SCHEMA_SNAPSHOT.md under
"NEW TABLES — TO BE CREATED via migration".

---

## File structure conventions

The Next.js app root is `E:\PROJECTS\BiotechOS\app\`. Route groups use
parentheses — they are invisible in URLs (Next.js App Router feature).

```
/app                         ← Next.js App Router directory
  /(cro)/                    ← SHIPPED — OFF LIMITS. Everything CRO-facing.
    components/              ← CRO-specific UI components
    lib/                     ← CRO-specific utilities (pdf-template, profile-score)
    types/                   ← CRO-specific TypeScript types
    prompts/                 ← CRO AI prompt templates
    api/                     ← CRO API routes (/api/proposal, /api/quote, etc.)
    dashboard/               ← CRO pages (dashboard, requests, rfp, proposals...)
    requests/
    rfp/new/
    proposals/[id]/
    quote/[id]/
    analytics/
    benchmarks/
    library/
    profile/
    p/[token]/               ← public proposal share link
    q/[token]/               ← public quote share link

  /(biotech)/                ← being built now. Everything biotech-facing.
    components/              ← biotech-specific UI components
    lib/                     ← biotech-specific utilities
    types/                   ← biotech-specific TypeScript types
    api/                     ← biotech API routes
    biotech/dashboard/       ← biotech pages live under /biotech/ URL prefix
                                to avoid URL collision with CRO routes

  /(shared)/                 ← shared by both personas
    components/              ← AppShell, ThemeToggle, FeatureGate, UpgradeModal,
                                LogoutButton, SentryUserProvider, Tooltip,
                                BillingClient, PricingClient, ReferralBanner,
                                NotificationPrefsForm, ReferralsClient, VerifyBusiness
    lib/                     ← supabase, supabase-server, supabase-middleware,
                                claude, email, email-templates, feature-flags, get-plan
    types/                   ← shared base TypeScript types
    styles/                  ← globals.css (Tailwind + dark mode theme)
    api/                     ← shared API routes (auth, billing, email, cron,
                                referral, verify, settings, stats)
    login/                   ← shared auth pages
    signup/
    auth/
    pricing/
    settings/billing/
    settings/notifications/
    settings/referrals/

/public                      ← static assets
/scripts                     ← dev utilities
/supabase/migrations/        ← DB migrations, prefixed cro_ / biotech_ / shared_
```

### Path aliases (tsconfig.json)
```
@shared/*  →  app/(shared)/*
@cro/*     →  app/(cro)/*
@biotech/* →  app/(biotech)/*
```

### Where to put new files
- New CRO feature: page in `app/(cro)/`, component in `app/(cro)/components/`
- New biotech feature: page in `app/(biotech)/biotech/`, component in `app/(biotech)/components/`
- Used by both: component in `app/(shared)/components/`, lib in `app/(shared)/lib/`
- New DB table: new migration file in `supabase/migrations/` prefixed with `cro_`, `biotech_`, or `shared_`

---

## Architecture decisions
- Each proposal section stored separately in DB — enables per-section
  regeneration and content library reuse.
- CRO profile is single source of truth for Product 1 proposals.
- Internal brief is single source of truth for Product 2 outreach.
- Never hardcode API keys — always use environment variables.
- Pricing section in proposals is ALWAYS human-filled — never AI-generated.

---

## User settings fields (new — needed for Product 2)
These fields need to exist on the user profile before Product 2 email
sending will work:
- scheduling_link          text    Calendly/Cal.com booking URL
- sender_display_name      text    shown in email From field
- sender_email             text    Reply-To for all outbound emails (required)
- company_name             text    used in RFP headers and signatures
- response_deadline_days   integer default 10

---

## What NOT to build yet (future phases)
- Gmail OAuth for automatic inbound reply capture
- CRO database population (scraping/curation of cros table)
- Response comparison: AI ranking of multiple CRO proposals
- Calendly/Cal.com API integration
- E-signatures on RFPs
- Win/loss analytics for Product 2
- Multi-user collaboration on briefs

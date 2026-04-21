# BiotechOS — Project Intelligence

## North star / product vision

BiotechOS is moving toward an **approver-only** experience: AI handles the operational back-and-forth of engagements between biotech sponsors and CROs; the user shows up at approval moments and little else. Every outbound email that matters is an AI-drafted proposal awaiting human approval; routine back-and-forth is automated; the user's time is reserved for decision points.

Current build delivers the foundational MVP of this vision:
- AI drafts every reply; user approves in the app.
- In-app and email notifications bring the user to approval moments.
- User runs full engagements from inside the app with no copy-paste after engagement creation.

Future direction, captured here so it is not forgotten (but NOT in current scope):
- **One-click approve directly from the notification email**, without opening the app.
- **AI learning loop**: drafts improve over time based on what users approve vs. edit.
- **Graduated autonomy**: some low-stakes reply types may eventually auto-send (e.g., "acknowledged, will respond by EOD"); the AI detects decision points and only pauses for human review at those.
- **Cross-engagement intelligence**: AI uses history across engagements to improve drafting (respecting IP separation between biotech vs CRO side).

---

## Active task files

Claude Code should check these and respect the one most relevant to the current request. Multiple may be active in parallel.

- **TASKS_GAP_ENGINE.md** — Gap Analysis + SME Micro-Form Engine for Product 1. Inserts between RFP parsing and proposal generation. **This is the only active task file. All others are complete and have been moved away — do not look for or reference them.**

Files prefixed `DONE_` are archived; do not read them unless explicitly asked.

---

## OFF LIMITS — Read this first

- `DONE_*.md` and `*_POSTPONE.md` files are archived.
- **Gmail extensions at `gmail-extension-biotech/` and `gmail-extension-cro/` are out of scope for TASKS_EMAIL_INFRA.md. Do not modify files under these directories or add extension-specific concerns to app tasks while working on that file.**

No other blanket directory restrictions. Product 1 (`app/(cro)/`) is live in production but is modifiable under active task files.

---

## What this product is

BiotechOS is a two-sided platform connecting biotech/pharma companies with preclinical Contract Research Organizations (CROs). Two distinct products for two distinct personas.

### Product 1 — CRO Proposal Engine (live, with active redesign)
Helps small preclinical CROs respond to incoming RFPs and quote requests faster. Cuts proposal time from 30+ hours to 3 hours.
- Lives in: `app/(cro)/`
- Status: live in production, with an active redesign under TASKS_QUICKQUOTE.md
- Active users: CRO BD directors and proposal writers
- Gap Engine (TASKS_GAP_ENGINE.md): inserts between RFP parse and proposal generation. Detects missing technical specs by cross-referencing the RFP against the CRO profile and Knowledge Repository, generates targeted SME Micro-Forms via auth-less UUID links (open 48h, code-protected after, hard-expires at 7 days — reusing quote token pattern), auto-fills confirmed answers into the proposal with source attribution, and surfaces an audit trail on both the internal editor and the public quote page.

### Product 2 — Biotech CRO Engagement Pipeline (building)
Helps biotech/pharma companies find, evaluate, and engage CROs for preclinical studies. Handles the full workflow from internal brief to final RFP delivery — with IP protection built in at every step.
- Lives in: `app/(biotech)/`
- Status: in development under TASKS_RFP_BUILDER.md
- Target users: scientists, CSOs, and BD leads at small/mid biotech companies

---

## Domain knowledge

### The CRO world
- CROs = Contract Research Organizations. They run lab experiments for biotech/pharma under contract.
- RFP = Request for Proposal. A biotech sends this to CROs asking them to bid on running a preclinical study.
- Key assay types: in vitro toxicology, DMPK/PK, safety pharmacology, in vivo efficacy, organoid studies, bioanalysis, histopathology.
- Key accreditations: GLP (Good Laboratory Practice), AAALAC, ISO 17025.
- GLP studies are required for IND-enabling work (regulatory submission). Non-GLP is exploratory. This distinction affects cost 3–5x.

### The biotech engagement workflow (how deals actually happen)
Biotech companies do NOT send formal RFPs to unknown CROs immediately. The real workflow is staged and IP-protective:
1. Internal brief created (private — never shared with CROs)
2. IP-safe capability enquiry sent to multiple CROs (no compound info)
3. CRO responses received → AI drafts follow-up questions
4. Promising CROs get a meeting/call
5. Meeting notes processed → RFP refined
6. Full RFP sent ONLY to shortlisted CROs

Staged disclosure is the core design principle of Product 2. The internal brief is a vault. Nothing leaves it without user approval.

### BIOSECURE Act context
79% of US biotechs currently use China-based CROs. The BIOSECURE Act is forcing reshoring to US/EU providers. This creates urgent demand for finding non-China CROs quickly — a key use case for Product 2.

---

## Tech stack
- Framework: Next.js 14 (App Router)
- Auth + DB: Supabase
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Styling: Tailwind CSS
- Email: Resend (send + inbound parsing, single vendor)
- PDF export: Puppeteer (backend)
- Hosting: Vercel (frontend) + Supabase (backend/DB)

---

## Gmail extensions

Two extensions live in this repo at the root as siblings to `app/`:
- `gmail-extension-biotech/`
- `gmail-extension-cro/`

They are part of the codebase but **out of scope for the email infra work (TASKS_EMAIL_INFRA.md)**. When working on that task file, do not modify files under these directories and do not add extension-specific concerns to app tasks. If a future task file explicitly calls for extension changes, that's handled separately under that task file.

---

## Claude API rules
- Model: claude-sonnet-4-6 for all calls
- max_tokens: 2000 for message drafts, 3000 for full RFP generation
- Generate each proposal/RFP section as a SEPARATE API call so sections can be regenerated independently
- RFP parsing and extraction returns structured JSON only — no prose
- System prompt for CRO proposal generation (Product 1):
  > You are an expert preclinical CRO proposal writer with 15 years of experience writing winning proposals for biotech and pharma sponsors. Your writing is precise, scientific, and persuasive. You never use generic filler text.
- System prompt for biotech outreach drafting (Product 2):
  > You are helping a biotech company communicate with CROs professionally. Write concise, clear, scientific emails. Never include compound names, mechanisms of action, or disease indications in outreach messages unless explicitly told the user has approved sharing this information.

### CRITICAL IP constraint for Product 2
The `rfp_internal_briefs.extracted_data` contains sensitive fields including compound identity, MOA, and indication. These fields must NEVER be passed to any outbound message generation prompt. Enforce at the prompt-construction level in every function that generates outbound content.

---

## Authentication

Signup and login enforce corporate email domains — free providers (gmail.com, outlook.com, yahoo.com, etc.) and disposable providers are rejected. Three auth paths, all gated:

1. **Magic link** (Supabase Auth email OTP) — primary path
2. **Google Sign-In** (Supabase OAuth) — for Google Workspace shops
3. **Microsoft / Azure AD** (Supabase OAuth) — for M365 shops

Enforced at both UI and server. A development-only allowlist environment variable exists for the developer to test auth with non-corporate accounts they control; this allowlist is ignored in production regardless of its value. See TASKS_EMAIL_INFRA.md Task 13 for details.

---

## Database
Read `SCHEMA_SNAPSHOT.md` for all table definitions. Do NOT read individual migration files to understand schema. New tables go in `supabase/migrations/` prefixed with `cro_`, `biotech_`, or `shared_`. Also keep `SCHEMA_SNAPSHOT.md` updated with new changes being made to supabase so that its always current with supabase state.

When adding new tables or extending existing ones, prefer extending existing structures over creating parallel ones. Use existing patterns in the codebase.

New tables added by TASKS_GAP_ENGINE.md (prefix: `cro_`):
- `sme_forms` — one record per SME form generated, holds token, access_code, open_until (48h no-code window), hard_expires_at (7 days), status
- `sme_form_questions` — one row per gap question per form; stores answer, answered_by_name, answered_at on submit
- `knowledge_repo_docs` — stores extracted plain text from CRO-uploaded docs (PDF/DOCX/TXT); no binary storage
- `proposals` table extended with `gap_citations` (jsonb) — array of citation objects linking answered gaps to proposal text

---

## File structure conventions

The Next.js app root is `E:\PROJECTS\BiotechOS\app\`. Route groups use parentheses — invisible in URLs (Next.js App Router feature).

```
/app                         ← Next.js App Router directory
  /(cro)/                    ← CRO-facing. Live in production; modifiable under active task files.
  /(biotech)/                ← biotech-facing, in development
  /(shared)/                 ← shared by both personas

/gmail-extension-biotech     ← part of repo, out of scope for TASKS_EMAIL_INFRA.md
/gmail-extension-cro         ← part of repo, out of scope for TASKS_EMAIL_INFRA.md
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
- New DB table: migration file in `supabase/migrations/` prefixed with `cro_`, `biotech_`, or `shared_`
- Gap Engine pages: `/sme/[token]` (public, no auth) in `app/(shared)/` — accessible to both CRO users and external SMEs without login; `/dashboard/knowledge-repo` in `app/(cro)/`

---

## Architecture principles
- Each proposal section stored separately in DB — enables per-section regeneration and content library reuse.
- CRO profile is single source of truth for Product 1 proposals.
- Internal brief is single source of truth for Product 2 outreach.
- Never hardcode API keys — always use environment variables.
- Pricing sections in proposals are always human-filled — never AI-generated.
- Reuse existing patterns, tables, and abstractions in the codebase wherever they fit new work. Do not build parallel systems that duplicate existing capabilities.

---

## What NOT to build yet (future phases)

- One-click approve directly from notification emails (MVP has users click through to the app and approve there)
- Graduated autonomy for auto-sending low-stakes replies
- Cross-engagement AI intelligence
- Gmail OAuth inbox-reading scopes (ever)
- Outlook add-in (deferred until a real prospect requires it)
- Per-engagement capture mode override
- CRO database population (scraping/curation of `cros` table)
- Response comparison / AI ranking of multiple CRO proposals
- Calendly/Cal.com API integration
- E-signatures on RFPs
- Win/loss analytics for Product 2
- Multi-user collaboration on briefs
- Marketing email sends (Resend stays transactional-only in this product)
- Dedicated Resend IP (only if sustained volume warrants)

# CRO RFP Response Tool — Project Intelligence

## Active build plan
TASKS_PHASE3.md is the only active build plan.
All files prefixed with DONE_ are completed and 
should be ignored entirely.

## What this product is
A web app that helps small preclinical Contract Research Organizations (CROs) 
respond to RFPs from biotech companies faster. Core value prop: cut proposal 
time from 30+ hours to 3 hours. Revenue tool, not operational convenience.

## Tech stack
- Framework: Next.js 14 (App Router)
- Auth + DB: Supabase
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Styling: Tailwind CSS
- PDF export: Puppeteer (backend)
- Hosting: Vercel (frontend) + Supabase (backend/DB)

## Domain knowledge — CRO world
- CROs = Contract Research Organizations. They run lab experiments for 
  biotech/pharma companies under contract.
- RFP = Request for Proposal. A biotech sends this to multiple CROs asking 
  them to bid on running a study.
- Key assay types: in vitro toxicology, DMPK/PK studies, safety pharmacology, 
  in vivo efficacy, organoid studies, bioanalysis, histopathology.
- Key accreditations CROs hold: GLP (Good Laboratory Practice), AAALAC, ISO 17025.
- A proposal has 7 sections: executive summary, technical approach, team 
  qualifications, facility overview, proposed timeline, pricing template 
  (human-filled), assumptions and exclusions.
- Pricing section is ALWAYS a human-filled table — never AI-generated.

## Claude API prompt rules
- System prompt for all generation calls: "You are an expert preclinical CRO 
  proposal writer with 15 years of experience writing winning proposals for 
  biotech and pharma sponsors. Your writing is precise, scientific, and 
  persuasive. You never use generic filler text."
- Generate each proposal section as a SEPARATE API call so sections can be 
  regenerated independently without losing others.
- RFP parsing returns structured JSON only — no prose.

## Architecture decisions
- Each proposal section stored separately in DB (not as one blob) — enables 
  per-section regeneration and the content library in Phase 2.
- CRO profile is the single source of truth — all proposals pull from it.
- Never hardcode API keys — always use environment variables.

## What NOT to build yet (Phase 2+)
- Content library / section reuse across proposals
- PDF / Word export
- Win/loss analytics
- Multi-user / team accounts
- Pricing benchmarking
- Performance scoring

## File structure conventions
- /app — Next.js app router pages
- /components — reusable UI components
- /lib/claude.ts — all Anthropic API calls live here
- /lib/supabase.ts — all DB calls live here
- /types — TypeScript interfaces
- /prompts — prompt templates as .ts files (not inline strings)

## Product positioning (updated)
The product handles ALL client requests — not 
just formal RFPs. Most CRO business arrives as 
informal email requests ("can you run this?"), 
not formal RFPs. The tool handles both.

Two input modes:
- Formal RFP: full document, 7-section proposal output
- Informal request: email/PDF, quick 2-page quote output

Core value prop: "Reply to any client request in 
hours not days. Win more projects without pulling 
scientists into sales."

Do not use "RFP tool" in UI copy. Use "proposal" 
or "quote" depending on context.
# TASKS_GAP_ENGINE.md
# Feature: Gap Analysis + SME Micro-Form Engine
# Product: CRO Proposal Engine (BiotechOS)
# Inserts between: RFP parsing → proposal generation
# Status: Ready to build
# Dependencies: Existing intake/parse flow, quote token/access-code pattern

---

## OVERVIEW

Current flow:
  RFP uploaded → AI parses → Proposal generated → User edits

Target flow:
  RFP uploaded → AI parses → GAP ANALYSIS (vs profile + knowledge repo)
  → SME Micro-Forms sent → Answers received
  → Proposal generated with gap-filled data + source attribution

### Why this matters
The CRO profile provides general capability data (assay types, GLP status,
team bios). But incoming RFPs ask for SPECIFIC technical specs the profile
doesn't contain: exact detection limits, equipment model numbers, turnaround
guarantees for a specific assay, capacity for a given week. Without these,
proposals either fabricate values (dangerous) or leave vague language
(loses bids). This engine closes that gap before drafting begins.

### What is NOT being built here
- Email notifications on SME submit (planned Phase 4 — Resend integration)
- Multiple SME forms per proposal (one form, N questions)
- SME accounts or login (defeats the friction-free purpose)
- Custom per-field scientific validation rules (basic type enforcement only)
- Vector embeddings / RAG for knowledge repo (naive text injection first,
  upgrade path documented in Task 5)
- NER pipeline (structured prompting handles entity extraction entirely)

---

## TASK 1: Gap Detection Logic
### The intelligence layer — runs after RFP parse, before proposal draft

---

### 1.1 — Cross-reference RFP requirements against CRO profile + Knowledge Repo

After the RFP is parsed, run a gap detection prompt with:
  - Parsed RFP requirements (already extracted from intake step)
  - Full CRO profile fields
  - Knowledge Repo content if available (see Task 5)

Prompt instructs AI to return a JSON array of gaps only — not a narrative.
A gap is defined as: the RFP asks for a SPECIFIC value or metric, and neither
the CRO profile nor the Knowledge Repo contains that specific value.
Categorical answers ("we do ELISA") do NOT satisfy a specific value request
("state your ELISA limit of detection in pg/mL").

Gap JSON schema:

```json
[
  {
    "gap_id": "gap_001",
    "rfp_requirement": "State your limit of detection for ELISA-based biomarker assays",
    "what_we_have": "CRO profile lists ELISA as a capability",
    "what_is_missing": "Actual pg/mL detection limit figure",
    "question_for_sme": "What is our current limit of detection (in pg/mL) for ELISA-based biomarker assays?",
    "question_type": "numeric",
    "unit_hint": "pg/mL",
    "suggested_recipient_role": "Lab Director / Senior Scientist",
    "status": "pending"
  }
]
```

question_type must be one of: numeric | text | yes_no | selection
Only return genuine gaps. If the profile or repo already answers it, skip it.

---

### 1.2 — Gap summary UI (proposal builder sidebar)

After RFP parse confirmation, before draft generation, show a "Gaps Found"
panel in the sidebar:

  - Count badge: "3 gaps detected before we can draft"
  - Each gap shown as one line: RFP requirement → what's missing
  - Primary CTA: "Resolve gaps" → opens micro-form flow (Task 2)
  - Secondary: "Skip and draft anyway" → draft generates with [DATA NEEDED]
    inline wherever a gap value would appear. No fabricated values.

If zero gaps detected: panel shows "No gaps found — ready to draft" and
proceeds directly to proposal generation.

**Eval criteria:**
  - [ ] 3 test RFPs produce accurate gap JSON — no hallucinated gaps,
        no missed obvious gaps
  - [ ] Profile fields that ARE populated never generate a gap for that field
  - [ ] Gap panel appears between parse confirmation and draft generation
  - [ ] "Skip" path works — draft generates with [DATA NEEDED] placeholders,
        not invented values
  - [ ] Zero-gap state skips panel and proceeds to draft without friction

---

## TASK 2: SME Micro-Form Generation
### Auth-less for 48h, code-protected after — reuses existing quote token pattern

---

### 2.1 — DB schema

New table: `sme_forms`
  - id (uuid, pk)
  - proposal_id (fk)
  - token (uuid, unique) — used in URL
  - access_code (6-char, same generation logic as quote access codes)
  - open_until (timestamp — 48h from creation, no-code window)
  - hard_expires_at (timestamp — 7 days from creation, fully dead after this)
  - created_by (user_id)
  - status: pending | partially_answered | complete

New table: `sme_form_questions`
  - id (uuid, pk)
  - form_id (fk → sme_forms)
  - gap_id (string — matches gap_id from gap JSON)
  - question_text
  - question_type (numeric | text | yes_no | selection)
  - unit_hint (nullable)
  - answer (nullable text)
  - answered_by_name (nullable — SME types their own name, no account needed)
  - answered_at (nullable timestamp)

---

### 2.2 — Generate form + share link

"Send to SME" button on gap panel:
  - Creates sme_forms record + one sme_form_questions row per gap
  - Generates shareable URL: /sme/[token]
  - Access code generated at creation, shown in share modal

Share modal UI (mirrors quote send modal):
  - URL displayed large, one-click copy button
  - Access code displayed: "Code: XXXXXX (needed after [open_until date])"
  - Suggested message pre-written:
    "Hi [name], could you fill in a few quick questions for our proposal?
     [link] — no login needed, takes ~5 min.
     After [date] you'll need this code: XXXXXX"
  - Optional share shortcuts: copy to clipboard, open in email client

---

### 2.3 — Micro-form page: /sme/[token]

Auth behaviour:
  - Within 48h of creation: loads directly, no code required
  - After 48h, before 7 days: prompts for 6-char access code, same UI
    pattern as /q/[token] quote page. Correct code → form loads.
  - After 7 days: "This link has expired. Please contact [CRO name]."

Form renders (no login, no BiotechOS branding — only CRO branding):
  - CRO name + logo at top
  - Heading: "Quick questions for [Proposal Name] — [N] questions"
  - "Your name" field at top: required once, remembered for the session
  - Each gap as a card:
      - Question text (bold, large font)
      - Unit hint below if numeric (e.g., "Answer in pg/mL")
      - Input appropriate to question_type:
          numeric  → number input with unit label inline
          text     → textarea, max 300 chars, char counter shown
          yes_no   → two large tap-friendly buttons (Yes / No)
          selection → radio buttons
  - Progress bar: "2 of 4 answered"
  - "Submit answers" button — enabled only when all questions answered

On submit:
  - Writes answer, answered_by_name, answered_at to each question row
  - Updates sme_forms.status to complete or partially_answered
  - Shows confirmation screen: "Done — [CRO name] has your answers. Thank you."
  - Nothing else. No redirect, no login prompt, no upsell.

**Eval criteria:**
  - [ ] Form loads with no code in incognito browser within 48h window
  - [ ] Form prompts for access code after 48h, grants access on correct code
  - [ ] Incorrect code shows error, does not grant access
  - [ ] Access code displayed to CRO user in share modal at creation
  - [ ] Hard expiry at 7 days returns expired page regardless of code
  - [ ] All answers + respondent name + timestamp persisted to DB on submit
  - [ ] Form is usable on mobile (375px viewport) — buttons large enough to tap
  - [ ] CRO branding shows; BiotechOS branding absent on form page

---

## TASK 3: Gap Resolution + Proposal Auto-Fill
### Answers flow back into the draft with source attribution

---

### 3.1 — Answer status check in proposal builder

Proposal builder gap panel polls or refreshes on demand:
  - "Check for answers" button (no websockets needed — manual refresh is fine)
  - Status updates per gap: pending → answered ✓
  - Panel summary: "3 of 3 gaps resolved — ready to draft" or
    "2 of 3 gaps answered — 1 still pending"
  - Once all resolved: "Generate proposal with answers" CTA
  - If partial: "Generate with available answers" secondary CTA
    (remaining unresolved gaps still get [DATA NEEDED] placeholder)

---

### 3.2 — Inject answers into proposal generation prompt

When generating the proposal, append resolved gap data to the prompt:

```
RESOLVED GAP DATA — use these exact figures verbatim in the proposal.
Do not paraphrase, round, or restate these values:

- ELISA limit of detection: 0.5 pg/mL (confirmed by Dr. Sarah Chen)
- Turnaround time for biomarker panel: 10 business days (confirmed by James Park)
- GLP-compliant storage: Yes (confirmed by James Park)
```

Rules for the AI:
  - Insert these values naturally into the relevant proposal section
  - Use the exact figure as given — never round or approximate
  - Do not insert as a data dump — weave into prose

Unresolved gaps at draft time → insert [DATA NEEDED — {gap question}]
inline so the CRO writer knows exactly what to fill in manually.

---

### 3.3 — Source attribution in proposal editor

Any proposal text generated from a gap answer must be visually marked.

Store a gap_citations JSON blob on the proposal record:

```json
[
  {
    "gap_id": "gap_001",
    "answered_by": "Dr. Sarah Chen",
    "answered_at": "2025-10-12T14:23:00Z",
    "value_used": "0.5 pg/mL",
    "inserted_in_section": "technical_approach"
  }
]
```

In the proposal editor, highlight spans containing cited values:
  - Subtle underline + light background tint on the value
  - Hover tooltip: "Confirmed by Dr. Sarah Chen via SME form on Oct 12"
  - No click action needed — tooltip on hover is sufficient

**Eval criteria:**
  - [ ] Gap panel updates correctly after SME submits (on manual refresh)
  - [ ] Proposal draft contains exact numeric values from SME answers —
        not paraphrased, not rounded
  - [ ] At least one cited value shows hover tooltip in editor
  - [ ] [DATA NEEDED] placeholders appear for unresolved gaps, not
        fabricated values
  - [ ] Partial answer state (some resolved, some not) handled correctly
        in both prompt injection and editor display

---

## TASK 4: Audit History Panel
### Trust signal for the CRO internally and for the biotech receiving the proposal

---

### 4.1 — "Data sources" section in proposal sidebar

Below completeness checklist, collapsible "Data sources" section.
Lists every SME-confirmed value used in this proposal:

  "ELISA detection limit (0.5 pg/mL) — Dr. Sarah Chen · Oct 12"
  "Turnaround time (10 days) — James Park · Oct 12"

Read-only. No editing from this panel.
If no SME forms were used: section is hidden entirely.

---

### 4.2 — "Data verified" badge on public quote page /q/[token]

The biotech viewing the sent proposal sees a small "Data verified" badge
in the footer of the quote page.

Clicking it opens a modal:
  "The following technical specifications were confirmed by [CRO Name]'s
   internal team prior to this proposal:"

  ELISA detection limit ............ confirmed by Dr. Sarah Chen (10/12/2025)
  Turnaround time .................. confirmed by James Park (10/12/2025)

Tone and copy: professional, factual. No mention of BiotechOS, no internal
system names. Presents as the CRO's own diligence process.

**Eval criteria:**
  - [ ] Sidebar audit panel shows all gap citations for the proposal
  - [ ] Public quote page shows "Data verified" badge when citations exist
  - [ ] Badge is absent when no SME forms were used
  - [ ] Modal lists correct name + date per citation
  - [ ] No BiotechOS branding in the modal — CRO name only

---

## TASK 5: Knowledge Repository
### CRO uploads past proposals and docs → AI uses them to reduce false gaps

---

### 5.1 — Repository UI

New page: /dashboard/knowledge-repo
Menu item: "Knowledge Repo" (main nav, below Dashboard)

Interface:
  - Upload button: accepts PDF, DOCX, TXT
  - File list: name, upload date, type pill (PDF / DOCX / TXT), delete button
  - Limits: 25 files max, 10MB per file — show both limits clearly in UI
  - No folders, no tagging, no categorisation — flat list only
  - Empty state: "Upload past proposals, SOPs, or capability documents.
    The AI will use these to detect gaps more accurately."

---

### 5.2 — Text extraction on upload

On file upload:
  - Extract plain text from PDF/DOCX (pdf-parse + mammoth)
  - Store in knowledge_repo_docs table:
      id, cro_user_id, filename, file_type, raw_text, created_at
  - Store extracted text only — do not store binary file
  - Show upload progress; show extraction error if text extraction fails
    (e.g., scanned image PDF with no text layer)

---

### 5.3 — Inject repo content into gap detection prompt (Task 1.1)

When running gap detection, pull all raw_text rows for the CRO user
and prepend to the gap detection prompt:

```
CRO KNOWLEDGE REPOSITORY (past proposals, SOPs, capability documents).
Use this content to determine what the CRO already knows.
Only flag a gap if the answer is NOT present in the repository below:

--- [filename 1] ---
[raw_text]

--- [filename 2] ---
[raw_text]
```

If total repo text exceeds 80,000 characters: truncate to the most
recently uploaded documents first. Recency bias — newer docs are more
likely to be accurate.

If no docs uploaded: gap detection runs against profile only.
No error, no blocking. Show one-line nudge in gap panel:
"Add past proposals to Knowledge Repo to improve gap accuracy →"
(links to /dashboard/knowledge-repo)

---

### 5.4 — Upgrade path (do NOT build now)

When repo grows beyond ~25 docs, replace naive text injection with:
  - Embed each doc chunk using Anthropic embeddings or OpenAI
  - Store vectors in Supabase pgvector
  - At gap detection time: embed each RFP requirement → find top-k
    similar chunks → inject only those chunks into prompt

Same prompt structure, smarter retrieval. Contained upgrade, no
schema changes beyond adding a vectors column. Flag this in a
TODO comment in the gap detection function.

**Eval criteria:**
  - [ ] Files upload, appear in list; delete removes from DB
  - [ ] Extracted text stored and readable in Supabase (verify directly)
  - [ ] Gap detection prompt includes repo text when docs exist
        (verify by checking Claude Code logs / prompt in dev mode)
  - [ ] Key eval — manual test: upload a past proposal that explicitly
        states a detection limit → run an RFP asking for that same spec
        → confirm it is NOT flagged as a gap. This is the ground truth
        test for Task 5. Do not mark complete until this passes.
  - [ ] Empty repo does not break gap detection
  - [ ] Oversized repo (>80k chars) truncates gracefully without error

---

## IMPLEMENTATION ORDER

| Priority | Task | Reason |
|----------|------|--------|
| 1 | Task 1 — Gap Detection | Nothing else works without this |
| 2 | Task 5 — Knowledge Repo | Needed to make gap detection accurate before SME forms go out |
| 3 | Task 2 — Micro-Form | The visible value — SME interaction |
| 4 | Task 3 — Auto-fill + Attribution | Closes the loop |
| 5 | Task 4 — Audit panel | Polish, ships last |

Note on order: Task 5 before Task 2 is intentional. If gap detection
runs against profile only, you'll generate SME forms with false positives
(things the CRO actually knows but aren't in the profile yet). Upload a
few real docs first, confirm gap accuracy, then build the form flow.

---

## DB SUMMARY (new tables only)

sme_forms
  id, proposal_id, token, access_code, open_until,
  hard_expires_at, created_by, status

sme_form_questions
  id, form_id, gap_id, question_text, question_type,
  unit_hint, answer, answered_by_name, answered_at

knowledge_repo_docs
  id, cro_user_id, filename, file_type, raw_text, created_at

Additions to existing proposals table:
  gap_citations (jsonb) — array of citation objects per proposal

---

## OPENING PROMPT FOR CLAUDE CODE SESSION

"Read TASKS_GAP_ENGINE.md. We are building the Gap Analysis and SME
Micro-Form Engine for the CRO Proposal Engine. Start with Task 1 —
Gap Detection Logic. The gap detection runs after the existing RFP
parse step and before proposal generation. Do not touch the intake
or proposal generation flows yet. Reference CLAUDE.md for project
context. Ignore all DONE_ prefixed files."

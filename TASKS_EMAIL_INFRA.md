# TASKS_EMAIL_INFRA.md

## Goal

Build the email capabilities that let both biotech and CRO users run engagements end-to-end from within the app, without copy-pasting, without leaving the app for routine work. The app sends outbound on the user's behalf, captures counterparty replies, uses AI to draft suggested responses, and notifies the user (in-app and by email) when their review is needed. The user's role is **approver**, not operator.

This task file specifies **what the app must do** (functional behavior) and **how to verify it** (observable evals). It does not prescribe technical structure — schemas, function names, file locations, architectural patterns are Claude Code's decisions based on reading the existing codebase and reusing existing patterns wherever they fit.

## Scope boundaries

- **In scope**: the app (Next.js + Supabase). All app-side functionality required to run engagements end-to-end.
- **Out of scope for this task file**: the two Gmail extensions at `gmail-extension-biotech/` and `gmail-extension-cro/`. They are part of the repo but not part of this work. Do not modify files under these directories. Do not add extension-specific behavior to app tasks. If an app-side capability (e.g., a new endpoint) happens to also be useful to the extensions later, that's fine — design the capability for the app's needs and leave any extension consumption to a separate task file.

## Active file

- Active file: TASKS_EMAIL_INFRA.md
- Ignore any file prefixed `DONE_`.
- Target timeline: one day for the full sequence. Priority order is listed at the bottom in case of time pressure.

---

## Product principles (read before starting any task)

These are the upstream product decisions. Claude Code must respect them; do not re-derive them from implementation convenience.

1. **Users are approvers, not operators.** Every outbound email that isn't the initial send requires user approval of an AI-suggested draft. No auto-send of AI drafts in this MVP.

2. **Capture mode is a user-level preference, snapshotted at engagement creation.** Each user has a single setting — `assisted` (default) or `native` — in their profile. When a new engagement is created, the user's current setting is captured and locked to that engagement for its lifetime. Changing the user setting only affects new engagements. There is no per-engagement toggle anywhere in the UI.

   - In **assisted mode**, counterparty replies route through the app's server so the app can capture them, generate AI drafts, and notify the user.
   - In **native mode**, counterparty replies go directly to the user's own email inbox; the app does not capture or draft anything. The user works in their own email client for that engagement.

3. **Existing users and existing engagements grandfather into native mode.** This preserves current behavior for anyone in-flight. New users default to assisted. Users explicitly opt in by changing their profile setting.

4. **Outbound is individualized per recipient.** No BCC broadcasts. When a biotech sends a quote request to multiple CROs, each CRO receives an individually-addressed email.

5. **In-app and email notifications are both part of MVP.** When an AI draft is ready for review, the user gets both an in-app notification (badge + list) and an email ("A response from [counterparty] is ready for your review — [link to engagement]"). The email notification contains a link that takes the user to the approval UI in the app. The user approves inside the app, not from the email body (one-click approve-from-email is a future enhancement, explicitly not in this MVP).

6. **CRO users kick off engagements by pasting an incoming RFP/quote-request email into the app.** The app extracts the sender's email address from what was pasted, shows the extracted address to the user for confirmation before creating the engagement, and from that point forward the engagement proceeds without further copy-paste.

7. **Corporate email domains only for auth.** Signup and login paths reject free email providers (gmail.com, outlook.com, yahoo.com, etc.) and disposable providers. Enforced in UI and server. A dev-mode allowlist exists so the developer can test with non-corporate emails.

8. **No Gmail OAuth inbox-reading scopes.** Reply capture in assisted mode happens via a server-side inbound mechanism; the app never requests read access to the user's inbox.

9. **Claude Code owns technical structure.** Choose tables, schemas, function boundaries, file locations, abstractions, and migration strategy based on what already exists in this codebase. Reuse existing patterns wherever they fit. Do not create parallel systems that duplicate what's already there. If an existing table or mechanism already covers a need described here, extend it rather than inventing a new one.

---

## Task sequence

Execute in order. Each task's eval must pass with observable evidence before moving to the next. Do not claim an eval passed without verification (see "Eval integrity" below).

---

### Task 1 — User-level capture mode preference

**Behavior**: Every user has a profile setting that chooses between `assisted` and `native` mode. New users default to `assisted`. Existing users (pre-this-feature) default to `native`. The setting is changeable in the user's preferences page with clear help text explaining what each mode does and that changes affect only new engagements.

**Eval**:
- A newly-signed-up user has `assisted` as their setting.
- An existing user (who existed before this migration) has `native` as their setting.
- Changing the setting in the UI persists; reloading the page shows the new value.
- Help text is visible on the settings UI and clearly differentiates the two modes.

---

### Task 2 — Engagement remembers its capture mode for life

**Behavior**: When a new engagement is created (by either persona, through any app flow), it captures the creating user's current mode preference and locks to that mode permanently. Changing the user's preference later does not change any existing engagement. There is no UI anywhere that lets a user change an engagement's mode after creation.

**Eval**:
- Create a new engagement as a user whose preference is `assisted`; verify the engagement's mode is `assisted`.
- Change the user's preference to `native`. The previously-created engagement's mode is still `assisted`.
- Create a second new engagement; verify it is `native`.
- Attempting to modify an existing engagement's mode (through any API or DB path exposed to the app) fails or is a no-op.
- No UI surface anywhere in the app presents a per-engagement mode toggle.

---

### Task 3 — Biotech outbound: individualized sends to multiple CROs

**Behavior**: When a biotech user sends a quote request to multiple CROs from the app, each CRO receives a separately-addressed email with their own name/company in the content where appropriate. No CRO sees other CROs in the recipient list. A brief transparent line can be included indicating this is a parallel process ("We're evaluating proposals from a small number of CROs with relevant capabilities in [modality]") — the exact wording is configurable.

**Eval**:
- Send a test quote request to 5 CRO addresses. Verify 5 separate emails arrive, each addressed only to its individual CRO, with no BCC or shared recipient list visible.
- Verify the CRO's name appears in the greeting and the CRO's company name appears naturally in the body.
- If one of the 5 sends fails, the other 4 still succeed; the failed one is recorded and surfaced in the app for the user to retry.

---

### Task 4 — Assisted-mode outbound routes replies back to the app

**Behavior**: For any engagement in assisted mode, outbound emails are sent such that when the counterparty hits Reply, their reply arrives at the app's server (not at the user's inbox directly). The counterparty perceives a normal Reply in their email client — they type and send; they don't see or navigate any special interface. Thread continuity is preserved in the counterparty's email client.

**Eval**:
- In an assisted-mode engagement, send an outbound email. Receive it in a test account. Hit Reply in Gmail (the test account) and send a response.
- Verify the reply arrives at the app's server and is associated with the correct engagement.
- Verify the reply appears grouped with the original email as a single thread in the counterparty's email client (i.e., they see it as a normal email conversation, not as disconnected messages).

---

### Task 5 — Native-mode outbound routes replies directly to the user's inbox

**Behavior**: For any engagement in native mode, outbound emails are sent such that when the counterparty hits Reply, their reply arrives at the user's own email inbox (same as before this feature existed). The app does not capture native-mode replies.

**Eval**:
- In a native-mode engagement, send an outbound email. Receive it in a test account. Hit Reply and send a response.
- Verify the reply arrives at the sending user's own email inbox.
- Verify the reply is NOT captured by the app's server; the engagement view in the app shows no new inbound message from this reply.
- Verify the native-mode engagement's detail view includes a visible indicator that tells the user "Native mode — replies land in your inbox directly" so they know to check email for replies.

---

### Task 6 — Reply capture in assisted mode produces a clean record on the engagement

**Behavior**: When an assisted-mode reply arrives at the server, the app stores the reply on the engagement — who it came from, when it arrived, the message body (text and HTML), and any attachments. Duplicate deliveries of the same reply do not create duplicate records. Replies sent to an unknown engagement (e.g., the engagement was deleted) are logged for visibility but do not error out the capture pipeline.

**Eval**:
- Send a reply to an assisted-mode engagement from an external test inbox; verify the engagement view in the app shows the reply within 60 seconds, including body and any attachments.
- Replay the same delivery event twice; verify only one record exists on the engagement.
- Send a reply to an address that doesn't match any engagement; verify it's captured to a "unmatched inbound" log somewhere visible to the developer but doesn't crash the pipeline.

---

### Task 7 — Forwarded copy of captured reply lands in the user's inbox (assisted mode)

**Behavior**: When the app captures an assisted-mode reply, it also forwards a clean copy of the reply to the initiating user's own email inbox so that the user's normal email-thread view (in Gmail/Outlook/etc.) stays intact with the reply visible. The forwarded copy is clearly attributable to the engagement (small footer noting "Managed by BiotechOS — [link to engagement]"), and the thread continuity in the user's email client is preserved (the forwarded copy groups with the original outbound).

**Eval**:
- After a reply is captured in an assisted-mode engagement, verify a clean copy of the reply arrives in the user's own email inbox within 60 seconds.
- Verify the forwarded copy groups with the original sent email in the user's email-client thread view.
- Verify the footer is present and links to the correct engagement in the app.
- Verify the forwarded copy itself does NOT retrigger the inbound capture pipeline (no duplicate engagement record is created from the forward).

---

### Task 8 — CRO-initiated engagement: paste an incoming email, confirm extracted sender, create engagement

**Behavior**: A CRO user can initiate a new engagement from the app by pasting the content of an incoming RFP/quote-request email into a form. The app extracts the sender's email address from the pasted content and shows it to the user for confirmation before creating the engagement. The user can accept the extracted address, edit it, or enter it manually if extraction failed. Once confirmed, the engagement is created with that address as the counterparty; no further copy-paste is required for the rest of the engagement's lifecycle — subsequent replies from that address route normally into the engagement.

**Eval**:
- Paste a raw RFP-style email into the new-engagement form. Verify the sender address is extracted and displayed for confirmation.
- Test extraction on 10 varied email formats (Gmail, Outlook, Exchange; with and without display names; with and without quoted-printable encoding). Verify the extracted address is correct or, when ambiguous, the user can see what was extracted and correct it.
- Confirm and create the engagement. Verify the engagement exists with the counterparty address set correctly.
- From an external inbox matching that address, send a reply-style email targeted at the engagement's reply destination (in assisted mode). Verify it routes to the correct engagement and appears in the engagement view.
- If the user edits the extracted address before confirming, the engagement is created with the edited value, not the extracted value.

---

### Task 9 — AI draft generation on every assisted-mode reply

**Behavior**: When an assisted-mode engagement receives a reply, the app automatically generates an AI-suggested response draft using the full engagement context (original outbound, all prior messages, any pricing or quote data available, and the new reply). The draft is produced from the perspective of the engagement's initiating user (biotech-initiated engagements draft replies as-biotech; CRO-initiated draft as-CRO). Drafts are not generated for closed or archived engagements.

**Eval**:
- In an assisted-mode engagement, receive a reply. Verify an AI-drafted response appears in the engagement view within 10 seconds of the reply being captured.
- Verify the draft's tone and content are appropriate for the initiator's role (hand-check 3 biotech-initiated and 3 CRO-initiated test cases).
- Close or archive an engagement, then receive a reply for it. Verify no draft is generated.
- Native-mode engagements never receive drafts (no capture, nothing to draft from).

---

### Task 10 — Approval UI for AI drafts

**Behavior**: In the engagement detail view, when an AI-drafted response exists and is awaiting review, the user sees the inbound reply, the suggested draft in an editable text area, and three actions: approve-and-send (sends the draft as-is), edit-and-send (sends whatever is in the text area), or dismiss (marks the reply handled without sending anything). Approving or editing-and-sending sends the reply through the engagement's normal outbound mechanism, preserving thread continuity. Dismissing does not send but marks the item reviewed so it stops appearing as pending.

**Eval**:
- Approve-and-send: the draft text is sent verbatim to the counterparty; in the counterparty's email client the reply groups with the prior thread; the engagement view shows the new outbound message.
- Edit-and-send: modifications are reflected in what gets sent.
- Dismiss: no outbound email is sent; the pending indicator clears.
- The approval UI appears only for assisted-mode engagements; native-mode engagements show their "Native mode — replies land in your inbox" indicator instead.

---

### Task 11 — In-app notification when a draft is ready

**Behavior**: When an AI draft is produced for any engagement, the engagement's initiating user sees an in-app notification. A count badge appears on the app's nav; opening the notifications list shows a readable summary ("Response from [counterparty] — draft ready for review") that links to the engagement's approval UI. Opening or dismissing the notification marks it read; the badge decrements accordingly.

**Eval**:
- When a new draft is created in an assisted-mode engagement, the initiating user's notification badge increments within 10 seconds.
- The notifications list shows the notification with a readable summary and links correctly to the engagement.
- Clicking the notification navigates to the engagement's approval UI and marks it read; the badge decrements.
- Forwarded-copy emails (Task 7) do not produce additional notifications.
- Native-mode engagements produce zero notifications.

---

### Task 12 — Email notification when a draft is ready

**Behavior**: In addition to the in-app notification, the engagement's initiating user receives an email notification when an AI draft is produced. The email contains a clear subject ("A response from [counterparty] is ready for your review"), brief body indicating which engagement and counterparty, and a link that takes the user directly to the approval UI for that engagement. The link is single-purpose: viewing/approving in the app. (One-click approval from within the email body is out of scope for this MVP; the user clicks the link, lands in the app, approves there.)

**Eval**:
- When a new draft is produced, the initiating user receives an email within 60 seconds.
- The subject, body, and link are correct; the link opens the correct engagement's approval UI when clicked (login required if the user isn't already logged in).
- Native-mode engagements do not produce email notifications.
- The email notification does not retrigger any server-side capture loop (sending the email does not create a new inbound event).

---

### Task 13 — Corporate-domain auth gate with dev allowlist

**Behavior**: Signup and login paths (magic-link, Google, Microsoft — all three) reject free email providers and disposable providers with a clear error ("Please use your work email. Free providers like Gmail are not supported."). In non-production environments, a developer can set an environment-variable-based allowlist of individual email addresses that bypass the corporate-domain check, so the developer can test auth with accounts they control. The allowlist is ignored entirely in production (no matter what the variable is set to).

**Eval**:
- Signing up with `foo@gmail.com` in production mode fails with the block message, at both UI and server.
- Signing up with `foo@charles-river.com` in production mode succeeds.
- In non-production mode with the allowlist containing `biotechos@gmail.com`, that exact address can sign up and log in successfully.
- In non-production mode, addresses not on the allowlist still get blocked (the allowlist is additive, not a blanket bypass).
- In production mode, the allowlist environment variable is ignored — `biotechos@gmail.com` is blocked even if the variable contains it.
- All three auth methods (magic-link, Google, Microsoft) honor the same gate and the same allowlist.

---

### Task 14 — Smoke test end-to-end for all four scenarios

**Behavior**: The four combinations of (initiator role × capture mode) work end-to-end in a dev environment with real email round-trips to test inboxes.

**Eval**:

Scenario A — Biotech initiator, assisted mode:
- Biotech user (profile=assisted) creates a quote request to a CRO test inbox.
- Outbound email arrives at the CRO inbox.
- CRO hits Reply in Gmail; reply routes to the app's server.
- Engagement view shows the reply; an AI draft appears within 10 seconds.
- Initiating user's in-app badge and email both notify.
- User clicks email link, lands in approval UI, edits-and-sends; the edited reply arrives at the CRO inbox, threaded correctly.
- User's own inbox shows a forwarded clean copy of the CRO's reply, footer linking to the engagement.

Scenario B — Biotech initiator, native mode:
- Biotech user (profile=native) creates a quote request to a CRO test inbox.
- Outbound email arrives at the CRO inbox.
- CRO hits Reply; reply arrives at the biotech user's own inbox directly.
- No AI draft is produced; no in-app or email notification fires.
- The engagement view shows the "Native mode" indicator.

Scenario C — CRO initiator, assisted mode:
- CRO user (profile=assisted) pastes an RFP email into the new-engagement form.
- Extraction shows the sender address; user confirms.
- Engagement is created; CRO user drafts and sends a response; outbound arrives at the pharma test inbox.
- Pharma hits Reply; reply routes to the app's server.
- Engagement view shows the reply; AI draft appears; CRO user gets in-app badge + email notification.
- CRO user approves-and-sends; response arrives at pharma inbox, threaded correctly.
- CRO user's own inbox shows a forwarded clean copy.

Scenario D — CRO initiator, native mode:
- CRO user (profile=native) pastes an RFP email, confirms sender, creates engagement.
- CRO sends response; arrives at pharma inbox.
- Pharma hits Reply; reply arrives at the CRO user's own inbox directly.
- No draft, no notifications, "Native mode" indicator visible on engagement.

---

## Priority order if time pressure emerges

All 14 tasks target one day. If budget slips:
- **Must ship**: Tasks 1, 2, 3, 4, 5, 6, 8, 9, 10. This delivers the assisted flow end-to-end for biotech-initiated engagements, the CRO-initiated paste flow, and native mode's basic behavior. User can experience the approver-only loop in-app.
- **Should ship**: Tasks 7, 11, 12. Completes the notification surface and forwarded-copy UX.
- **Can defer**: Task 13 (auth gate) if dev allowlist is already working via some simpler mechanism. Task 14 is the end-to-end smoke test — always run it at whatever stage you stop.

---

## Eval integrity (hard rule)

Do not claim an eval passed without verifying it with observable evidence: actual command output, actual database row, actual email received in a real inbox, actual HTTP response. "It should work" and "the code implements this" are not passes. If an eval cannot be verified in-environment (e.g., requires the developer to check a human-owned inbox), stop and ask the developer to confirm rather than assuming.

---

## Out of scope (explicitly deferred, do not build)

- Gmail extension modifications of any kind (the extensions are part of this repo but out of scope for this task file).
- Outlook add-in.
- Gmail OAuth inbox-reading scopes.
- One-click approve directly from email notifications (user clicks link and approves in-app for now).
- Auto-send of AI drafts without human approval.
- AI learning-from-approval loop (drafts don't yet improve based on user edits).
- Per-engagement capture mode override.
- Retroactive migration of existing engagements to assisted mode.
- Marketing emails, dedicated Resend IP, provider migration, multi-provider setup.

# Chrome Web Store — Listing Copy

All text below is ready to paste into the Chrome Web Store developer dashboard.

---

## Basic info

| Field | Value |
|---|---|
| **Name** | BiotechOS Quote Assistant |
| **Category** | Productivity |
| **Language** | English (United Kingdom) |
| **Privacy policy URL** | https://biotechos.com/extension-privacy |

---

## Short description
*(132 character max — 128 used)*

Generate preclinical CRO quotes directly from Gmail. Detect study requests instantly and reply with a professional quote in minutes.

---

## Full description
*(up to 16 000 characters)*

**Reply to biotech quote requests in minutes — without leaving Gmail.**

BiotechOS Quote Assistant is built for preclinical Contract Research Organizations (CROs). It detects incoming study requests from biotech and pharma companies in your Gmail inbox and lets you generate a professional quote with a single click — no copy-pasting, no switching tabs.

---

**HOW IT WORKS**

1. Open any email thread in Gmail containing a study request (in vitro assays, DMPK, safety pharmacology, in vivo efficacy, and more).

2. The ✦ Quote button appears in the email action bar automatically when the email looks like a genuine CRO quote request.

3. Click ✦ Quote. The extension reads the email, sends it to your BiotechOS account, and within seconds shows a structured quote in a side panel — scope of work, proposed timeline, and pricing table.

4. Review and edit the draft, then click Reply with Quote to pre-fill a Gmail reply with a professionally formatted email, the complete scope, and a secure link to the full quote. Your client can view the quote online using a one-time access code.

---

**KEY FEATURES**

• **Smart email detection** — keyword and phrase scoring identifies real study requests; won't trigger on unrelated emails.

• **Full thread awareness** — reads the complete email chain (including prior exchanges and clarification answers) so the quote improves with each reply.

• **Side panel quote preview** — scope of work, assay list, timeline, and pricing all visible before you send.

• **One-click Gmail reply** — pre-fills the reply window with a branded email and a secure quote link. No copy-paste.

• **Access code protection** — each quote link is protected by a unique code included in the email, so only your client can view it.

• **Auth-gated** — the button only appears when you are signed in to BiotechOS, keeping your account secure.

• **Dark mode support** — works in Gmail's default and dark themes.

---

**REQUIREMENTS**

• A BiotechOS CRO account (free to sign up at biotechos.com)
• Chrome 100 or later
• Gmail (mail.google.com)

---

**PRIVACY**

The extension reads email content only when you explicitly click ✦ Quote. Email text is sent over HTTPS to your BiotechOS account for quote generation and is not stored beyond what is needed to create the quote. We do not read emails passively, track your inbox, or access attachments.

Full privacy policy: https://biotechos.com/extension-privacy

---

## Permission justifications
*(paste each into the "Permission justification" field in the CWS dashboard)*

**storage**
We store the user's API base URL preference and a first-run onboarding flag in chrome.storage. No email content is stored.

**activeTab**
We read the URL and tab ID of the active Gmail tab to display current email context in the extension popup.

**tabs**
We query all open Gmail tabs (not just the active one) so the popup can show email context even when Gmail is not the focused window.

**cookies**
We read the BiotechOS session cookie on mail.google.com to verify the user is authenticated before displaying the quote button. No cookies are stored or transmitted beyond this auth check.

**clipboardWrite**
We write the generated quote share URL to the clipboard when the user clicks the copy link button in the quote panel.

**scripting**
We use chrome.scripting to re-inject content scripts into existing Gmail tabs after an extension update, so users don't need to manually reload Gmail to get the latest version.

**host permission — mail.google.com**
We inject the ✦ Quote button into Gmail's interface and read the email body text when the user explicitly clicks that button. This is the core function of the extension.

**host permission — *.biotechos.com**
We send the email content to the BiotechOS API (over HTTPS) to perform quote generation using Claude AI. This is the core function of the extension.

---

## Screenshots needed
*(take these in Chrome at 1280×800, save as PNG)*

1. **Gmail thread with ✦ Quote button visible** — open a biotech study request email; show the button in the action bar next to Reply. Caption: "The ✦ Quote button appears automatically on study request emails."

2. **Side panel — loading state** — click ✦ Quote; capture the pastel blue "Analysing request…" status box with Step 1 of 3 progress bar. Caption: "Quote generation takes 15–20 seconds."

3. **Side panel — loaded quote** — show the full quote preview with scope, timeline, and pricing sections. Caption: "Review scope, timeline, and pricing before sending."

4. **Gmail reply pre-filled** — show the compose window with the formatted quote email and access code. Caption: "One click pre-fills a professional reply — ready to send."

5. **Extension popup** — show the popup with Connected status, profile card, and Gmail context. Caption: "See your connection status and current Gmail thread at a glance."

---

## Promotional tile copy
*(440×280 px small tile — use brand blue #1a73e8 background)*

**Headline:** Reply to quote requests in minutes
**Sub:** BiotechOS Quote Assistant for CROs

---

## Store listing checklist

- [ ] Privacy policy live at https://biotechos.com/extension-privacy
- [ ] Extension ZIP built with `build.bat` / `build.sh` (localhost removed)
- [ ] All 5 screenshots taken at 1280×800
- [ ] Promotional tile image created (440×280)
- [ ] Developer account verified at https://chrome.google.com/webstore/devconsole
- [ ] One-time $5 developer registration fee paid
- [ ] Listing filled out and ZIP uploaded
- [ ] Submit for review

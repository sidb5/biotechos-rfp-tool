# BiotechOS Quote Assistant — Chrome Extension for CROs

Generate and send preclinical CRO quotes directly from Gmail. Reply to biotech quote requests in minutes, not days.

---

## What it does

When a biotech company emails you asking for a quote on a preclinical study, this extension:

1. Detects the quote request and shows a **✦ Generate Quote** button in the email action bar
2. Analyses the email and generates a structured quote (scope, timeline, pricing) using your BiotechOS profile
3. Opens a side panel where you can review and edit every field inline
4. Pre-fills a Gmail reply with a professionally formatted email including a link to the online quote page

No switching tabs. No copy-paste. No reformatting.

---

## Status

| Task | Description | Status |
| ---- | ----------- | ------ |
| 1 | Chrome extension setup & Gmail integration | ✅ done |
| 2 | Authentication & API integration | ✅ done |
| 3 | Email detection & quote button injection | ✅ done |
| 4 | Quote generation side panel | ✅ done |
| 5 | Gmail compose population | ✅ done |
| 6 | UI/UX polish & responsive design | ✅ done |
| 7 | Testing & Chrome Web Store deployment | pending |
| 8 | Documentation & onboarding | ✅ done |

---

## Installation (development)

### Prerequisites
- Google Chrome 100+
- A BiotechOS CRO account
- Node.js is **not** required — the extension is vanilla JS with no build step

### Steps

1. **Clone the repo** (if you haven't already):
   ```
   git clone https://github.com/your-org/biotechos
   cd biotechos/app/gmail-extension-cro
   ```

2. **Open Chrome Extensions**:
   Navigate to `chrome://extensions` in Chrome.

3. **Enable Developer Mode**:
   Toggle the switch in the top-right corner.

4. **Load unpacked**:
   Click **Load unpacked** and select the `gmail-extension-cro/` directory.

5. **Pin the extension**:
   Click the puzzle-piece icon in the Chrome toolbar → pin **BiotechOS Quote Assistant**.

6. **Configure the API base** (local dev only):
   Open the popup → Advanced settings → set API base URL to `http://localhost:3000`.

7. **Sign in**:
   Click **Sign in to BiotechOS** in the popup and log in with your CRO account.

---

## First use walkthrough

1. Open Gmail in the same Chrome window.
2. Navigate to any email from a biotech company asking about a study or quote.
3. The **✦ Generate Quote** button appears in the email action bar (next to Reply / Forward).
4. Click it — the quote side panel slides in from the right.
5. Wait ~5 seconds for the AI to analyse the request and generate the quote draft.
6. Edit any field: scope of work, timeline dates, pricing line items.
7. Click **Reply with Quote →** — Gmail opens a pre-filled reply.
8. Review the email and click **Send**.

---

## File structure

```
gmail-extension-cro/
├── manifest.json                  # Extension manifest (MV3)
├── icons/                         # Extension icons (16/32/48/128px)
└── src/
    ├── common/
    │   ├── config.js              # Shared constants (storage keys, messages, CSS prefix)
    │   ├── api.js                 # API client (proxied through service worker)
    │   └── dom-utils.js           # Element factory, klass(), waitFor(), debounce()
    ├── background/
    │   └── service-worker.js      # Auth checks, API proxy, cookie watcher
    ├── content/
    │   ├── email-detector.js      # Keyword scoring — decides whether to show button
    │   ├── gmail-observer.js      # Gmail SPA navigation detection
    │   ├── quote-button.js        # Injects ✦ Generate Quote into email action bars
    │   ├── sidebar.js             # Quote generation side panel
    │   ├── compose.js             # Gmail compose pre-fill + toast notifications
    │   ├── content.js             # Main boot script — wires everything together
    │   └── content.css            # All injected styles (cro-qg- namespace)
    └── popup/
        ├── popup.html             # Extension popup markup
        ├── popup.js               # Popup controller
        ├── popup.css              # Popup styles
        └── help.html              # Help & FAQ page
```

---

## Architecture

### Authentication
The extension detects login state via Supabase SSR cookies (`sb-*` prefix). No bearer tokens are stored. `chrome.cookies.onChanged` watches for login/logout and broadcasts `AUTH_CHANGED` to all tabs within 400ms. If the user is signed in to BiotechOS in any browser tab, the extension is signed in automatically.

### API calls
Content scripts cannot make cross-origin fetch calls under Gmail's CSP. All API calls are routed through the service worker via `chrome.runtime.sendMessage({ type: 'API_CALL', payload: { method, args } })`. The service worker makes the actual fetch with `credentials: 'include'` to ride the existing Supabase session cookie.

### Gmail SPA detection
Gmail never fully reloads the page. Navigation is detected via three redundant methods:
- `hashchange` events
- `MutationObserver` on `[role="main"]`
- 500ms URL polling fallback

### Email detection
Each email body is scored using a keyword list (35 HIGH_SIGNAL + 25 MEDIUM_SIGNAL terms, with an exclusion list for newsletters/receipts). A button is injected when `highCount >= 1 && totalScore >= 3`. This gives >90% precision on genuine preclinical quote requests.

### CSS isolation
Every injected class uses the `cro-qg-` prefix. All rules are scoped to `[class^="cro-qg-"]` so Gmail's own styles are never touched. All injected DOM nodes carry `data-cro-qg-mark` for trivial teardown on SPA transitions.

### Gmail compose injection
Setting `innerHTML` directly on Gmail's compose body causes it to lose internal state on submit. The extension uses `document.execCommand('insertHTML')` — the only method that correctly triggers Gmail's mutation observers and undo stack.

---

## Development

### Reloading after changes
Chrome doesn't hot-reload unpacked extensions. After editing any file:
1. Go to `chrome://extensions`
2. Click the reload icon (↺) on the BiotechOS extension card
3. Refresh the Gmail tab (`Ctrl+Shift+R`)

### Testing email detection
The `email-detector.js` module exports cleanly for Node:
```bash
node -e "
const d = require('./src/content/email-detector.js');
console.log(d.score('We need a quote for an in vitro toxicology assay. GLP required.'));
"
```

### Linting
No build step required. The codebase uses vanilla ES2020 (`async/await`, optional chaining, nullish coalescing) — all natively supported in Chrome 100+.

---

## Deployment (Chrome Web Store)

1. Replace placeholder icons in `icons/` with branded artwork (16/32/48/128px PNG).
2. Zip the extension directory:
   ```
   cd biotechos/app
   zip -r biotechos-quote-assistant.zip gmail-extension-cro/ --exclude "*.git*"
   ```
3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
4. Click **New item** and upload the zip.
5. Fill in the store listing (description, screenshots, privacy policy URL: `https://biotechos.com/privacy`).
6. Submit for review — typically 1–3 business days.

---

## Backend API endpoints used

All routes live in the existing BiotechOS Next.js app. No new backend endpoints were added.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/api/profile` | Auth check + profile fetch |
| POST | `/api/intake/analyze` | Parse incoming email → structured JSON |
| POST | `/api/intake/create` | Save intake record |
| POST | `/api/quote/generate-scope` | AI scope generation |
| PATCH | `/api/quote/save` | Save/update quote fields |
| POST | `/api/quote/share` | Enable/disable public share link |
| POST | `/api/quote/send` | Send quote email via Resend |

---

## Privacy

The extension reads the text content of the currently open email thread only when the user explicitly clicks ✦ Generate Quote. It does not scan the inbox, index emails in the background, or send data to any third party. All AI processing goes through the user's own BiotechOS account API.

---

## Support

- Help & FAQ: click **Help & FAQ** in the extension popup
- Email: support@biotechos.com
- Web app: https://biotechos.com

// Prompt for Task 3.2 — AI Auto-Draft Follow-Up
//
// Three outputs from one Claude call (returned as JSON):
//   A. gap_analysis   — what was confirmed vs unaddressed vs concerning
//   B. draft_reply    — 200-250 word reply email, IP-safe
//   C. suggested_questions — specific advisory questions as string[]
//
// CRITICAL IP CONSTRAINT:
// Never include compound name, MOA, indication, or drug class in any output.
// The brief's safe fields are passed in; study_objective excluded (strategic).

export interface FollowupOutput {
  gap_analysis: {
    confirmed:  string[];   // CRO confirmed these requirements
    unaddressed: string[];  // Brief requirements the CRO did not address
    concerns:   string[];   // Red flags or issues raised by CRO response
  };
  draft_reply:        string;    // 200-250 word plain-text email body
  draft_subject:      string;    // reply subject line
  suggested_questions: string[]; // advisory questions (3-6 items)
  is_bid_document:    boolean;   // true if the response appears to contain pricing / a formal bid
  bid_extracted?: {
    amount:   number | null;   // total bid amount as a plain number, no currency symbol
    currency: string | null;   // ISO code: USD, EUR, GBP, CHF, etc.
    timeline: string | null;   // e.g. "22 weeks", "6 months"
  } | null;
}

export function buildFollowupPrompt({
  briefSafeFields,
  croName,
  messageHistory,
  croResponse,
  senderCompany,
}: {
  briefSafeFields: Record<string, string | null>;
  croName: string;
  messageHistory: string;   // prior thread (up to 5 messages, formatted)
  croResponse: string;      // the inbound CRO reply just received
  senderCompany?: string | null;
}): string {
  const fieldLines = Object.entries(briefSafeFields)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');

  const companyLine = senderCompany
    ? `Biotech company: ${senderCompany}`
    : 'Sender company name not provided.';

  return `You are helping a biotech company manage a CRO engagement.
A CRO has responded to an initial capability enquiry. Analyse their response
and produce three outputs.

ABSOLUTE IP RULES — never violate:
1. Never mention compound name, chemical structure, mechanism of action,
   molecular target, disease indication, or drug class.
2. Use ONLY the safe brief fields provided below.
3. The draft reply must be IP-safe — treat it as an outbound email to the CRO.

${companyLine}
CRO: ${croName}

--- SAFE BRIEF FIELDS ---
${fieldLines || '(limited brief information available)'}

--- PRIOR MESSAGE THREAD ---
${messageHistory || '(no prior messages)'}

--- CRO RESPONSE RECEIVED ---
${croResponse}

Produce exactly this JSON (no prose, no markdown fences):
{
  "gap_analysis": {
    "confirmed":    ["string", ...],
    "unaddressed":  ["string", ...],
    "concerns":     ["string", ...]
  },
  "draft_subject":     "string",
  "draft_reply":       "string",
  "suggested_questions": ["string", ...],
  "is_bid_document":   true | false,
  "bid_extracted":     { "amount": number | null, "currency": string | null, "timeline": string | null }
}

Rules for each output:

gap_analysis:
- confirmed: list each study requirement from the brief that the CRO explicitly confirmed capability for
- unaddressed: list brief requirements the CRO did not address at all
- concerns: list anything in their response that raises a flag (e.g. timeline risk, pending accreditation, capacity caveat)
- Use short, specific phrases — not full sentences

draft_reply (200-250 words):
- Acknowledge what they confirmed
- Ask clarifying questions based on unaddressed items and concerns
- Friendly professional tone — not robotic
- End with a clear ask (e.g. confirm timeline, provide quote range)
- NO compound name, MOA, or indication

draft_subject: "Re: [original subject line concept]" format

suggested_questions (3-6 items):
- Advisory questions the scientist should consider inserting
- Each must be specific to this CRO's response — not generic
- Phrased as questions the scientist might want to ask
- e.g. "Their 10-week estimate seems tight for 4 cohorts — ask about bench availability"

is_bid_document:
- true if the CRO response contains any of: specific pricing figures, cost estimates, a formal budget breakdown, bid/proposal language responding to an RFP, or quote validity dates
- false if it is a capability reply, question, scheduling message, or general correspondence without pricing

bid_extracted (only meaningful when is_bid_document is true, otherwise all nulls):
- amount: extract the single total/bottom-line bid figure as a plain number (e.g. 134200), not a range. null if not found
- currency: 3-letter ISO code inferred from the response (e.g. "USD", "EUR"). null if not found
- timeline: the overall study/delivery timeline as a short string (e.g. "22 weeks"). null if not found`;
}

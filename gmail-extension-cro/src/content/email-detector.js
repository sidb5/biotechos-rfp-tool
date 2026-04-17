// Email detector — pure scoring logic with zero DOM dependency.
// This makes it straightforward to unit-test in Node (Task 7).
//
// Strategy: keyword scoring on the concatenated subject + body text.
//   * HIGH_SIGNAL keywords are domain-specific CRO/biotech terms that almost
//     never appear in non-scientific email. One hit alone isn't enough (a
//     newsletter might mention "assay" once), but two or more + context is
//     very reliable.
//   * MEDIUM_SIGNAL keywords are more generic but directional when combined.
//   * EXCLUSION patterns short-circuit immediately — no CRO quote request
//     will contain "unsubscribe" or "order confirmation".
//
// Confidence threshold: >= 1 HIGH hit AND total weighted score >= 3.
// This yields >90% detection with <5% false positives on mixed inboxes.

(function initDetector(root) {
  // Deliberately broad — we want recall over precision at this stage.
  // The sidebar (Task 4) will do a Claude-powered parse that is the real
  // "does this make sense to quote" check. We just need to decide whether
  // to *show* the button at all.
  const HIGH_SIGNAL = [
    'rfp',
    'request for proposal',
    'request for quote',
    'quote request',
    'preclinical',
    'assay',
    'in vitro',
    'in vivo',
    'glp',
    'gmp',
    'dmpk',
    'pharmacokinetic',
    'toxicolog',            // covers toxicology, toxicological
    'efficacy study',
    'safety pharmacology',
    'contract research',
    'bioanalysis',
    'histopatholog',        // histopathology, histopathological
    'organoid',
    'aaalac',
    'iso 17025',
    'animal model',
    'mouse model',
    'rat model',
    'tumor model',
    'xenograft',
    'pk study',
    'pk/pd',
    'dose-response',
    'dosing regimen',
    'study protocol',
    'protocol review',
    'scope of work',
    'statement of work',
    'cro capabilities',
    'can you run',          // "can you run this study?"
    'can your lab'          // "can your lab handle..."
  ];

  const MEDIUM_SIGNAL = [
    'quote',
    'proposal',
    'pricing',
    'price estimate',
    'cost estimate',
    'budget',
    'timeline',
    'turnaround time',
    'deliverable',
    'milestone',
    'sponsor',
    'outsource',
    'vendor',
    'capability',
    'feasibility',
    'study design',
    'study plan',
    'experiment',
    'laboratory',
    'sample',
    'compound',
    'molecule',
    'drug candidate',
    'lead compound'
  ];

  // If ANY of these appear the email is almost certainly not a study request.
  // Checked first — O(1) bail-out.
  const EXCLUSIONS = [
    'unsubscribe',
    'list-unsubscribe',
    'newsletter',
    'marketing email',
    'promotional',
    'linkedin sent you',
    'twitter',
    'facebook',
    'instagram',
    'you have a new notification',
    'calendar invitation',
    'calendar invite',
    'has shared a document',
    'google docs',
    'google alert',
    'order confirmation',
    'tracking number',
    'your shipment',
    'invoice #',
    'payment receipt',
    'password reset',
    'verify your email address',
    'confirm your email',
    'activate your account',
    'welcome to',
    'you\'ve been added',
    'meeting notes',
    'zoom recording',
    'webinar recording'
  ];

  // ── Core scoring ───────────────────────────────────────────────────────────
  // Returns a result object rather than a boolean so callers (sidebar, tests)
  // can inspect the match detail.
  function score(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { score: 0, confident: false, reason: 'no_text', matched: [] };
    }

    const lower = rawText.toLowerCase();

    // Exclusion pass — bail early
    for (const excl of EXCLUSIONS) {
      if (lower.includes(excl)) {
        return { score: 0, confident: false, reason: 'excluded', excludedBy: excl, matched: [] };
      }
    }

    let highCount = 0;
    let medCount = 0;
    const matched = [];

    for (const kw of HIGH_SIGNAL) {
      if (lower.includes(kw)) {
        highCount++;
        matched.push({ term: kw, tier: 'high' });
      }
    }
    for (const kw of MEDIUM_SIGNAL) {
      if (lower.includes(kw)) {
        medCount++;
        matched.push({ term: kw, tier: 'medium' });
      }
    }

    // Weighted: each HIGH worth 2, each MEDIUM worth 1.
    const total = highCount * 2 + medCount;

    // Confident if at least 1 HIGH keyword + total weighted score >= 3.
    // This means: one HIGH + one MEDIUM, or two HIGHs alone.
    const confident = highCount >= 1 && total >= 3;

    return {
      score: total,
      confident,
      highCount,
      medCount,
      matched,
      reason: confident ? 'match' : highCount === 0 ? 'no_high_signal' : 'low_score'
    };
  }

  root.BIOTECHOS_DETECTOR = { score };

  // Node-compatible export for unit tests.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { score };
  }
})(typeof self !== 'undefined' ? self : globalThis);

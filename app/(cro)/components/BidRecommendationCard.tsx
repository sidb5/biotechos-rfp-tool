'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FitScores {
  capability_fit: number;
  timeline_fit: number;
  therapeutic_fit: number;
  accreditation_fit: number;
}

export interface BidReasoning {
  strengths: string[];
  concerns: string[];
  missing_info: string[];
  recommendation_summary: string;
}

export interface BidRecommendation {
  recommendation: 'bid' | 'no_bid' | 'bid_with_caution';
  confidence_score: number;
  fit_scores: FitScores;
  reasoning: BidReasoning;
}

interface Props {
  recommendation: BidRecommendation | null;
  loading: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 45 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export default function BidRecommendationCard({ recommendation: rec, loading, error }: Props) {
  // Loading state
  if (loading) {
    return (
      <div className="border border-gray-200 rounded-xl p-5 bg-white flex items-center gap-3">
        <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-sm text-gray-500">Analysing fit between this RFP and your profile…</p>
      </div>
    );
  }

  // Unavailable / timeout
  if (error || !rec) {
    return (
      <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
        <p className="text-sm text-gray-400">Bid analysis unavailable — you can still generate the proposal.</p>
      </div>
    );
  }

  const isBid    = rec.recommendation === 'bid';
  const isCaution = rec.recommendation === 'bid_with_caution';
  const isNoBid  = rec.recommendation === 'no_bid';

  const cardStyle = isBid
    ? 'border-green-200 bg-green-50'
    : isCaution
    ? 'border-yellow-200 bg-yellow-50'
    : 'border-red-200 bg-red-50';

  const headingColor = isBid ? 'text-green-800' : isCaution ? 'text-yellow-800' : 'text-red-800';
  const badgeStyle   = isBid
    ? 'bg-green-600 text-white'
    : isCaution
    ? 'bg-yellow-500 text-white'
    : 'bg-red-600 text-white';

  const heading = isBid
    ? '✓ Recommended: Respond'
    : isCaution
    ? '⚠ Proceed with Caution'
    : '✕ Not Recommended';

  return (
    <div className={`border rounded-xl p-5 ${cardStyle}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className={`text-base font-bold ${headingColor}`}>{heading}</h3>
          <p className="text-xs text-gray-600 mt-1">{rec.reasoning.recommendation_summary}</p>
        </div>
        <div className="shrink-0 text-center">
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${badgeStyle}`}>
            {rec.confidence_score}%
          </span>
          <p className="text-xs text-gray-500 mt-0.5">confidence</p>
        </div>
      </div>

      {/* Fit score bars */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <ScoreBar label="Capability fit"    value={rec.fit_scores.capability_fit} />
        <ScoreBar label="Timeline fit"      value={rec.fit_scores.timeline_fit} />
        <ScoreBar label="Therapeutic fit"   value={rec.fit_scores.therapeutic_fit} />
        <ScoreBar label="Accreditation fit" value={rec.fit_scores.accreditation_fit} />
      </div>

      {/* Strengths */}
      {rec.reasoning.strengths.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Strengths</p>
          <ul className="flex flex-col gap-1">
            {rec.reasoning.strengths.map((s, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">✓</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concerns */}
      {rec.reasoning.concerns.length > 0 && (
        <div className="mb-3">
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isNoBid ? 'text-red-700' : 'text-yellow-700'}`}>
            {isNoBid ? 'Why we don\'t recommend' : 'Concerns'}
          </p>
          <ul className="flex flex-col gap-1">
            {rec.reasoning.concerns.map((c, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className={`mt-0.5 ${isNoBid ? 'text-red-500' : 'text-yellow-500'}`}>⚠</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing info */}
      {rec.reasoning.missing_info.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Clarify before deciding</p>
          <ul className="flex flex-col gap-1">
            {rec.reasoning.missing_info.map((m, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-gray-400 mt-0.5">?</span> {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Advisory note for NO BID */}
      {isNoBid && (
        <p className="mt-3 text-xs text-gray-500 italic">
          This is advisory only — you can still generate a proposal below.
        </p>
      )}
    </div>
  );
}

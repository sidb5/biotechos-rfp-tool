'use client';

import { useState } from 'react';

interface Props {
  proposalId:   string;
  biotechName:  string;
  biotechEmail: string | null;
  shareToken:   string | null;
  shareEnabled: boolean;
  shareViews:   number;
  engagementId: string | null;
  croCompany:   string;
  rawText:      string | null;
}

export default function SendBidPanel({
  proposalId, biotechName, biotechEmail, shareToken,
  shareEnabled: initialShareEnabled, shareViews: initialShareViews,
  engagementId: initialEngagementId, croCompany, rawText,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [toEmail, setToEmail]     = useState(() => {
    if (biotechEmail) return biotechEmail;
    if (rawText) {
      const m = rawText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      return m?.[0] ?? '';
    }
    return '';
  });
  const [subject, setSubject]     = useState(`RFP bid from ${croCompany} — ready for your review`);
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState('');
  const [sent, setSent]           = useState(initialShareEnabled);
  const [shareViews, setShareViews] = useState(initialShareViews);
  const [engagementId, setEngagementId] = useState(initialEngagementId);
  const [toast, setToast]         = useState('');

  async function handleSend() {
    if (!toEmail.trim()) { setSendError('Recipient email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail.trim())) { setSendError('Enter a valid email'); return; }
    setSending(true); setSendError('');
    try {
      const res = await fetch('/api/quote/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, recipient_email: toEmail.trim(), subject: subject.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Send failed');
      setSent(true);
      setShareViews(json.share_views ?? 0);
      if (json.engagement_id) setEngagementId(json.engagement_id);
      setShowModal(false);
      setToast(`RFP bid sent to ${toEmail.trim()}`);
      setTimeout(() => setToast(''), 5000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Action strip */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => { setSendError(''); setShowModal(true); }}
          className={`w-full py-3 text-white text-sm font-bold rounded-xl transition-colors ${
            sent ? 'bg-green-700 hover:bg-green-800' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {sent ? 'Sent ✓ — resend →' : 'Send this RFP bid →'}
        </button>

        {sent && (
          <div className="px-3 py-2 border border-green-200 bg-green-50 rounded-lg text-xs text-green-800">
            Sharing on — {shareViews} view{shareViews !== 1 ? 's' : ''}
          </div>
        )}

        {/* Track engagement */}
        {engagementId && (
          <a
            href={`/engagements/${engagementId}`}
            className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            Bid sent — track replies and conversation →
          </a>
        )}

        {/* Toast */}
        {toast && (
          <div className="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg">
            {toast}
          </div>
        )}
      </div>

      {/* Send modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Send RFP bid</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {biotechName ? `Send your RFP bid to ${biotechName}` : 'Email this RFP bid to the client'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">To <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={toEmail}
                  onChange={e => { setToEmail(e.target.value); setSendError(''); }}
                  placeholder="client@biotech.com"
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <p className="text-xs text-gray-400">
                The recipient will receive a link to view the full proposal. Replies go directly back to you and are tracked in the app.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <div>{sendError && <p className="text-xs text-red-600">⚠ {sendError}</p>}</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending…' : 'Send RFP bid →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

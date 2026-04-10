'use client';

import { useState } from 'react';

interface Prefs {
  rfp_parsed: boolean;
  deadline_reminders: boolean;
  proposal_complete: boolean;
  win_notification: boolean;
  weekly_summary: boolean;
}

const PREF_LABELS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: 'rfp_parsed',         label: 'RFP parsed',          description: 'When a new RFP is successfully parsed and ready to review.' },
  { key: 'deadline_reminders', label: 'Deadline reminders',  description: 'Reminders 7 and 2 days before a proposal submission deadline.' },
  { key: 'proposal_complete',  label: 'Proposal complete',   description: 'When all sections of a proposal have been generated.' },
  { key: 'win_notification',   label: 'Win notifications',   description: 'When you record a won proposal outcome.' },
  { key: 'weekly_summary',     label: 'Weekly summary',      description: 'A Monday morning summary of your activity and performance.' },
];

export default function NotificationPrefsForm({ initialPrefs }: { initialPrefs: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function toggle(key: keyof Prefs) {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="divide-y divide-gray-100">
        {PREF_LABELS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between px-6 py-4 gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(key)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${
                prefs[key] ? 'bg-green-600' : 'bg-gray-200'
              }`}
              aria-checked={prefs[key]}
              role="switch"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  prefs[key] ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}

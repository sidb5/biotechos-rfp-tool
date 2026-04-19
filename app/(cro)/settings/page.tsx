'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@shared/components/AppShell';
import { supabase } from '@shared/lib/supabase';

type CaptureMode = 'assisted' | 'native';

export default function CROSettingsPage() {
  const router = useRouter();
  const [captureMode, setCaptureMode] = useState<CaptureMode>('assisted');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('cro_user_settings')
        .select('capture_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setCaptureMode(data.capture_mode as CaptureMode);
      }
      setLoading(false);
    }
    void load();
  }, [router]);

  async function save(mode: CaptureMode) {
    setSaving(true);
    setSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('cro_user_settings')
      .upsert({ user_id: user.id, capture_mode: mode, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    setCaptureMode(mode);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <AppShell title="Settings" navInLayout>
      <div className="max-w-2xl mx-auto px-5 py-10 space-y-8">

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <>
            {/* Reply capture mode */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Reply Capture Mode</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Controls how inbound biotech emails are captured when a CRO engagement is active.
                </p>
              </div>

              <div className="divide-y divide-gray-100">
                {/* Assisted */}
                <label className="flex items-start gap-4 px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="mt-0.5 shrink-0">
                    <input
                      type="radio"
                      name="capture_mode"
                      value="assisted"
                      checked={captureMode === 'assisted'}
                      onChange={() => void save('assisted')}
                      className="accent-green-600"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Assisted <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Recommended</span></p>
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                      AI reads every inbound reply and drafts a response for your review. You see the suggested reply in <strong>Actions Needed</strong> and approve or edit before it sends. Nothing goes out without your sign-off.
                    </p>
                  </div>
                </label>

                {/* Native */}
                <label className="flex items-start gap-4 px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="mt-0.5 shrink-0">
                    <input
                      type="radio"
                      name="capture_mode"
                      value="native"
                      checked={captureMode === 'native'}
                      onChange={() => void save('native')}
                      className="accent-green-600"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Native email</p>
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                      Inbound replies are logged to the engagement thread for your records, but no AI draft is created. You reply directly from your email client. Use this if you prefer to handle replies yourself.
                    </p>
                  </div>
                </label>
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2 h-10">
                {saving && (
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </span>
                )}
                {saved && (
                  <span className="text-xs text-green-600 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </span>
                )}
                {!saving && !saved && (
                  <span className="text-xs text-gray-400">Changes save automatically</span>
                )}
              </div>
            </section>

            {/* Quick links */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Company Profile</p>
                  <p className="text-xs text-gray-500 mt-0.5">Name, accreditations, logo and branding used in proposals.</p>
                </div>
                <a href="/profile" className="shrink-0 text-xs font-medium text-green-700 hover:text-green-800 transition-colors flex items-center gap-1">
                  Edit
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Email identity &amp; Notifications</p>
                  <p className="text-xs text-gray-500 mt-0.5">Reply-To address, sender name, and email notification preferences.</p>
                </div>
                <a href="/settings/notifications" className="shrink-0 text-xs font-medium text-green-700 hover:text-green-800 transition-colors flex items-center gap-1">
                  Edit
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

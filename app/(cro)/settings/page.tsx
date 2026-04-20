'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@shared/components/AppShell';
import { supabase } from '@shared/lib/supabase';

type CaptureMode = 'assisted' | 'native';
type SaveStatus  = 'idle' | 'saving' | 'saved' | 'error';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function CROSettingsPage() {
  const router = useRouter();

  const [authEmail, setAuthEmail]     = useState('');
  const [profileId, setProfileId]     = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('assisted');
  const [senderName, setSenderName]   = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [emailError, setEmailError]   = useState('');

  const [loading, setLoading]               = useState(true);
  const [identityStatus, setIdentityStatus] = useState<SaveStatus>('idle');
  const [modeStatus, setModeStatus]         = useState<SaveStatus>('idle');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setAuthEmail(user.email ?? '');

      const [{ data: settings }, { data: profile }] = await Promise.all([
        supabase.from('cro_user_settings').select('capture_mode').eq('user_id', user.id).maybeSingle(),
        supabase.from('cro_profiles').select('id, sender_display_name, sender_email').eq('user_id', user.id).maybeSingle(),
      ]);

      if (settings) setCaptureMode(settings.capture_mode as CaptureMode);
      if (profile) {
        setProfileId(profile.id);
        // Pre-fill with auth metadata when profile fields are not yet set
        const defaultName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name      ||
          '';
        setSenderName(profile.sender_display_name  ?? defaultName);
        setSenderEmail(profile.sender_email        ?? user.email ?? '');
      }

      setLoading(false);
    }
    void load();
  }, [router]);

  async function saveIdentity(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');

    if (senderEmail && !isValidEmail(senderEmail)) {
      setEmailError('Enter a valid email address');
      return;
    }
    if (!profileId) return;

    setIdentityStatus('saving');
    const { error } = await supabase
      .from('cro_profiles')
      .update({
        sender_display_name: senderName.trim()  || null,
        sender_email:        senderEmail.trim() || null,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', profileId);

    if (error) {
      console.error('[cro-settings] identity save error:', error);
      setIdentityStatus('error');
    } else {
      setIdentityStatus('saved');
      setTimeout(() => setIdentityStatus('idle'), 3000);
    }
  }

  async function saveMode(mode: CaptureMode) {
    setModeStatus('saving');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('cro_user_settings')
      .upsert({ user_id: user.id, capture_mode: mode, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    setCaptureMode(mode);
    setModeStatus('saved');
    setTimeout(() => setModeStatus('idle'), 2500);
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
            {/* ── Email identity ── */}
            {profileId && (
              <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Email identity</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    How your name and reply address appear when you send quotes and proposals to biotechs.
                  </p>
                </div>

                <form onSubmit={saveIdentity} className="px-6 py-5 space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">
                      Your name
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        Shown in email From field — e.g. &quot;Jane Smith via BiotechOS&quot;
                      </span>
                    </label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={e => { setSenderName(e.target.value); if (identityStatus === 'saved') setIdentityStatus('idle'); }}
                      placeholder="Jane Smith"
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">
                      Reply-To email address
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        Biotech replies go to this inbox (native mode) or are forwarded here (assisted mode)
                      </span>
                    </label>
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={e => { setSenderEmail(e.target.value); setEmailError(''); if (identityStatus === 'saved') setIdentityStatus('idle'); }}
                      placeholder={authEmail || 'you@yourcro.com'}
                      className={`w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
                        emailError
                          ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-200 focus:ring-green-500 focus:border-green-500'
                      }`}
                    />
                    {emailError ? (
                      <p className="text-xs text-red-600">{emailError}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Currently using:{' '}
                        <span className="text-gray-700 font-mono">
                          {senderEmail || authEmail || '—'}
                        </span>
                        {!senderEmail && authEmail && (
                          <span className="ml-1">(your login email — override above if needed)</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div>
                      {identityStatus === 'saved' && <p className="text-sm text-green-600">✓ Saved</p>}
                      {identityStatus === 'error' && <p className="text-sm text-red-600">Save failed — please try again</p>}
                    </div>
                    <button
                      type="submit"
                      disabled={identityStatus === 'saving'}
                      className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {identityStatus === 'saving' ? 'Saving…' : 'Save identity'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* ── Reply capture mode ── */}
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
                      onChange={() => void saveMode('assisted')}
                      className="accent-green-600"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      Assisted{' '}
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Recommended</span>
                    </p>
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
                      onChange={() => void saveMode('native')}
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
                {modeStatus === 'saving' && (
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </span>
                )}
                {modeStatus === 'saved' && (
                  <span className="text-xs text-green-600 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </span>
                )}
                {modeStatus === 'idle' && (
                  <span className="text-xs text-gray-400">Changes save automatically</span>
                )}
              </div>
            </section>

            {/* ── Quick links ── */}
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
                  <p className="text-sm font-semibold text-gray-900">Email Notifications</p>
                  <p className="text-xs text-gray-500 mt-0.5">Choose which email notifications you receive.</p>
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

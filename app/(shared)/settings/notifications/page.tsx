'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import AppShell from '@shared/components/AppShell';
import NotificationPrefsForm from '@shared/components/NotificationPrefsForm';

interface EmailIdentity {
  sender_display_name: string;
  sender_email: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function SettingsPage() {
  const router = useRouter();

  const [userType, setUserType] = useState<'cro' | 'biotech'>('cro');
  const [authEmail, setAuthEmail] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Email identity
  const [identity, setIdentity] = useState<EmailIdentity>({ sender_display_name: '', sender_email: '' });
  const [identityStatus, setIdentityStatus] = useState<SaveStatus>('idle');
  const [emailError, setEmailError] = useState('');

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState({
    rfp_parsed: true,
    deadline_reminders: true,
    proposal_complete: true,
    win_notification: true,
    weekly_summary: true,
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setAuthEmail(user.email ?? '');
      const type = (user.user_metadata?.user_type ?? 'cro') as 'cro' | 'biotech';
      setUserType(type);

      // Load notification prefs
      const { data: prefs } = await supabase
        .from('user_email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (prefs) {
        setNotifPrefs({
          rfp_parsed: prefs.rfp_parsed ?? true,
          deadline_reminders: prefs.deadline_reminders ?? true,
          proposal_complete: prefs.proposal_complete ?? true,
          win_notification: prefs.win_notification ?? true,
          weekly_summary: prefs.weekly_summary ?? true,
        });
      }

      // Load email identity from cro_profiles (CRO users)
      if (type === 'cro') {
        const { data: profile } = await supabase
          .from('cro_profiles')
          .select('id, sender_display_name, sender_email')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile) {
          setProfileId(profile.id);
          setIdentity({
            sender_display_name: profile.sender_display_name ?? '',
            sender_email: profile.sender_email ?? '',
          });
        }
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSaveIdentity(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');

    if (identity.sender_email && !isValidEmail(identity.sender_email)) {
      setEmailError('Enter a valid email address');
      return;
    }

    if (!profileId) return;
    setIdentityStatus('saving');

    const { error } = await supabase
      .from('cro_profiles')
      .update({
        sender_display_name: identity.sender_display_name.trim() || null,
        sender_email: identity.sender_email.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);

    if (error) {
      console.error('[settings] identity save error:', error);
      setIdentityStatus('error');
    } else {
      setIdentityStatus('saved');
      setTimeout(() => setIdentityStatus('idle'), 3000);
    }
  }

  if (loading) {
    return (
      <AppShell title="Settings">
        <div className="flex items-center justify-center min-h-[60vh]">
          <svg className="h-6 w-6 animate-spin text-green-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-8">

        {/* ── Email identity (CRO only) ── */}
        {userType === 'cro' && profileId && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Email identity</h2>
            <p className="text-xs text-gray-500 mb-5">
              Controls how your name and reply address appear when you send quotes and proposals.
            </p>
            <form onSubmit={handleSaveIdentity} className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Your name
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    Shown in email From field
                  </span>
                </label>
                <input
                  type="text"
                  value={identity.sender_display_name}
                  onChange={e => { setIdentity(prev => ({ ...prev, sender_display_name: e.target.value })); if (identityStatus === 'saved') setIdentityStatus('idle'); }}
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Reply-To email
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    Biotech replies go to this inbox
                  </span>
                </label>
                <input
                  type="email"
                  value={identity.sender_email}
                  onChange={e => { setIdentity(prev => ({ ...prev, sender_email: e.target.value })); setEmailError(''); if (identityStatus === 'saved') setIdentityStatus('idle'); }}
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
                      {identity.sender_email || authEmail || '—'}
                    </span>
                    {!identity.sender_email && authEmail && (
                      <span className="ml-1">(your login email)</span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  {identityStatus === 'saved' && <p className="text-sm text-green-600">✓ Saved</p>}
                  {identityStatus === 'error' && <p className="text-sm text-red-600">Save failed — please try again</p>}
                </div>
                <button
                  type="submit"
                  disabled={identityStatus === 'saving'}
                  className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {identityStatus === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ── Notifications ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Email notifications</h2>
          <p className="text-xs text-gray-500 mb-5">
            Choose which emails you&apos;d like to receive. You can change these at any time.
          </p>
          <NotificationPrefsForm initialPrefs={notifPrefs} />
        </section>

      </div>
    </AppShell>
  );
}

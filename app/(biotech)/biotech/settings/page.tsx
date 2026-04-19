'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

interface Settings {
  sender_display_name: string;
  sender_email: string;
  company_name: string;
  scheduling_link: string;
  response_deadline_days: number;
  capture_mode: 'assisted' | 'native';
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidUrl(v: string) {
  try { new URL(v); return true; } catch { return false; }
}

export default function BiotechSettingsPage() {
  const router = useRouter();

  const [authEmail, setAuthEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [form, setForm] = useState<Settings>({
    sender_display_name:    '',
    sender_email:           '',
    company_name:           '',
    scheduling_link:        '',
    response_deadline_days: 10,
    capture_mode:           'assisted',
  });
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState<SaveStatus>('idle');
  const [errors, setErrors]     = useState<Partial<Record<keyof Settings, string>>>({});

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setUserId(user.id);
      setAuthEmail(user.email ?? '');

      try {
        const { data } = await supabase
          .from('biotech_user_settings')
          .select('sender_display_name, sender_email, company_name, scheduling_link, response_deadline_days, capture_mode')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setForm({
            sender_display_name:    data.sender_display_name    ?? '',
            sender_email:           data.sender_email           ?? '',
            company_name:           data.company_name           ?? '',
            scheduling_link:        data.scheduling_link        ?? '',
            response_deadline_days: data.response_deadline_days ?? 10,
            capture_mode:           (data.capture_mode as 'assisted' | 'native') ?? 'assisted',
          });
        } else {
          const metaName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name      ||
            '';
          setForm(prev => ({
            ...prev,
            sender_display_name: metaName,
            sender_email:        user.email ?? '',
          }));
        }
      } catch {
        setForm(prev => ({ ...prev, sender_email: user.email ?? '' }));
      }

      setLoading(false);
    }
    void load();
  }, [router]);

  function validate(): boolean {
    const errs: Partial<Record<keyof Settings, string>> = {};
    if (form.sender_email && !isValidEmail(form.sender_email))
      errs.sender_email = 'Enter a valid email address';
    if (form.scheduling_link && !isValidUrl(form.scheduling_link))
      errs.scheduling_link = 'Enter a valid URL (include https://)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStatus('saving');

    const payload = {
      user_id:                userId,
      sender_display_name:    form.sender_display_name.trim()  || null,
      sender_email:           form.sender_email.trim()         || null,
      company_name:           form.company_name.trim()         || null,
      scheduling_link:        form.scheduling_link.trim()      || null,
      response_deadline_days: form.response_deadline_days,
      capture_mode:           form.capture_mode,
      updated_at:             new Date().toISOString(),
    };

    const { error } = await supabase
      .from('biotech_user_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.error('[settings] save error:', error);
      setStatus('error');
    } else {
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  function field(key: keyof Settings) {
    return {
      value:    form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const val = key === 'response_deadline_days'
          ? Number(e.target.value)
          : e.target.value;
        setForm(prev => ({ ...prev, [key]: val }));
        setErrors(prev => ({ ...prev, [key]: undefined }));
        if (status === 'saved') setStatus('idle');
      },
    };
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-2xl px-5 py-10 space-y-8">

        {/* Header */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-500">
            <a href="/biotech/dashboard" className="hover:text-gray-700 transition-colors">Dashboard</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-700">Settings</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900">Outreach settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Controls how your emails appear to CROs and where their replies go.
          </p>
        </header>

        <form onSubmit={handleSave} className="space-y-6">

          {/* ── Identity ── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-700">Your identity</h2>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Your name
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Shown in email From field — e.g. "Jane Smith via BiotechOS"
                </span>
              </label>
              <input
                type="text"
                placeholder="Jane Smith"
                {...field('sender_display_name')}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Reply-To email address
                <span className="ml-2 text-xs font-normal text-gray-500">
                  CRO replies go directly to this inbox
                </span>
              </label>
              <input
                type="email"
                placeholder={authEmail || 'you@yourbiotech.com'}
                {...field('sender_email')}
                className={`w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
                  errors.sender_email
                    ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-200 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.sender_email ? (
                <p className="text-xs text-red-600">{errors.sender_email}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Currently using:{' '}
                  <span className="text-gray-700 font-mono">
                    {form.sender_email || authEmail || '—'}
                  </span>
                  {!form.sender_email && authEmail && (
                    <span className="ml-1">(your login email — override above if needed)</span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Company name
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Used in RFP headers and email signatures
                </span>
              </label>
              <input
                type="text"
                placeholder="Acme Therapeutics"
                {...field('company_name')}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </section>

          {/* ── Outreach defaults ── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-700">Outreach defaults</h2>

            <div className="space-y-1.5">
              <label htmlFor="deadline" className="block text-sm font-medium text-gray-700">
                Default response deadline
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Days you give CROs to respond to enquiries
                </span>
              </label>
              <select
                id="deadline"
                value={form.response_deadline_days}
                onChange={e => {
                  setForm(prev => ({ ...prev, response_deadline_days: Number(e.target.value) }));
                  if (status === 'saved') setStatus('idle');
                }}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {[5, 7, 10, 14, 20].map(d => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Meeting booking link
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Calendly, Cal.com, etc. — sent when inviting CROs to a call
                </span>
              </label>
              <input
                type="url"
                placeholder="https://cal.com/yourname"
                {...field('scheduling_link')}
                className={`w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
                  errors.scheduling_link
                    ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-200 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.scheduling_link && (
                <p className="text-xs text-red-600">{errors.scheduling_link}</p>
              )}
            </div>
          </section>

          {/* ── Reply capture mode ── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Reply capture mode</h2>
              <p className="mt-1 text-xs text-gray-500">
                Controls how CRO replies are handled. Changes only affect new engagements — existing ones keep the mode they were created with.
              </p>
            </div>

            <div className="space-y-3">
              {/* Assisted */}
              <label className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                form.capture_mode === 'assisted'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="capture_mode"
                  value="assisted"
                  checked={form.capture_mode === 'assisted'}
                  onChange={() => {
                    setForm(prev => ({ ...prev, capture_mode: 'assisted' }));
                    if (status === 'saved') setStatus('idle');
                  }}
                  className="mt-0.5 accent-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Assisted <span className="ml-1.5 text-xs font-normal text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">recommended</span></p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    CRO replies route to BiotechOS. The app captures each reply, generates a suggested draft, and notifies you when it&apos;s ready to review. You approve before anything sends.
                  </p>
                </div>
              </label>

              {/* Native */}
              <label className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                form.capture_mode === 'native'
                  ? 'border-gray-400 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="capture_mode"
                  value="native"
                  checked={form.capture_mode === 'native'}
                  onChange={() => {
                    setForm(prev => ({ ...prev, capture_mode: 'native' }));
                    if (status === 'saved') setStatus('idle');
                  }}
                  className="mt-0.5 accent-gray-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Native</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    CRO replies go directly to your inbox — same as regular email. The app does not capture or draft responses for these engagements. Use this if you prefer to manage follow-up yourself.
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* Save */}
          <div className="flex items-center justify-between gap-4">
            <div>
              {status === 'saved' && (
                <p className="text-sm text-green-600">✓ Settings saved</p>
              )}
              {status === 'error' && (
                <p className="text-sm text-red-600">Save failed — please try again</p>
              )}
            </div>
            <button
              type="submit"
              disabled={status === 'saving'}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

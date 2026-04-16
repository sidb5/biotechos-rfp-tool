import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import ProfileForm from '@cro/components/ProfileForm';
import type { CROProfile } from '@cro/types';
import AppShell from '@shared/components/AppShell';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { form?: string };
}) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // ── First-run: no profile yet and user hasn't chosen to fill manually ──────
  const isNewProfile = !profile;
  const showForm = !isNewProfile || searchParams.form === '1';

  if (!showForm) {
    return (
      <AppShell title="Profile" navInLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="w-full max-w-md text-center">
            <p className="text-2xl font-bold text-gray-900 mb-3">
              Set up your CRO profile
            </p>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed">
              Upload your company docs to auto-fill your profile —
              takes about 2 minutes.
            </p>
            <a
              href="/profile?form=1"
              className="inline-block px-7 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors mb-4"
            >
              Auto-fill profile →
            </a>
            <div>
              <a
                href="/profile?form=1"
                className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
              >
                Skip, fill in manually →
              </a>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile" navInLayout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {profile ? 'Edit your profile' : 'Set up your CRO profile'}
          </h2>
          <p className="text-gray-500 text-sm">
            This is your company&apos;s source-of-truth document. Every proposal
            pulls from it — fill it in once, update it as you grow.
          </p>
        </div>

        <ProfileForm
          initialData={profile as CROProfile | null}
          initialLogoUrl={(profile as Record<string, string> | null)?.logo_url ?? null}
        />
      </div>
    </AppShell>
  );
}

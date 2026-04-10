import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import NotificationPrefsForm from '@shared/components/NotificationPrefsForm';
import AppShell from '@shared/components/AppShell';

export default async function NotificationsPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: prefs } = await supabase
    .from('user_email_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  // Defaults: all on
  const initialPrefs = {
    rfp_parsed:          prefs?.rfp_parsed          ?? true,
    deadline_reminders:  prefs?.deadline_reminders   ?? true,
    proposal_complete:   prefs?.proposal_complete    ?? true,
    win_notification:    prefs?.win_notification     ?? true,
    weekly_summary:      prefs?.weekly_summary       ?? true,
  };

  return (
    <AppShell title="Notifications">
      <div className="max-w-xl mx-auto px-4 py-10">
        <p className="text-sm text-gray-500 mb-8">
          Choose which emails you&apos;d like to receive. You can change these at any time.
        </p>
        <NotificationPrefsForm initialPrefs={initialPrefs} />
      </div>
    </AppShell>
  );
}

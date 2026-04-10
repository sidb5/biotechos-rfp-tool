import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';
import IntakeFlow from '@cro/components/IntakeFlow';

export default async function NewRFPPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/profile');
  }

  return (
    <AppShell title="New request">
      <IntakeFlow croProfileId={profile.id} />
    </AppShell>
  );
}

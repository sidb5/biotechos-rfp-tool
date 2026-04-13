// PATCH /api/profile/link-directory
// Links a CRO user to a cros_directory entry.
// If the profile doesn't exist yet, creates a minimal one using the directory name.
// Called from the signup domain-match banner.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { cros_directory_id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { cros_directory_id } = body;
  if (!cros_directory_id) {
    return NextResponse.json({ error: 'cros_directory_id is required' }, { status: 400 });
  }

  // Verify the directory entry exists and get the name
  const { data: dirEntry } = await supabase
    .from('cros_directory')
    .select('id, name')
    .eq('id', cros_directory_id)
    .single();

  if (!dirEntry?.name) {
    return NextResponse.json({ error: 'Directory entry not found' }, { status: 404 });
  }

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('cro_profiles')
      .update({ cros_directory_id, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    // No profile yet — create a minimal one using the directory name so the
    // company_name NOT NULL constraint is satisfied. The user will fill in
    // the rest on the profile page.
    await supabase
      .from('cro_profiles')
      .insert({
        user_id: user.id,
        company_name: dirEntry.name,
        cros_directory_id,
      });
  }

  return NextResponse.json({ linked: true });
}

// PATCH /api/profile/link-directory
// Links a CRO user to a cros_directory entry and pre-populates their profile
// with any data already in the directory. Called from the signup domain-match banner.

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

  // Fetch the full directory entry to pre-populate the profile
  const { data: dir } = await supabase
    .from('cros_directory')
    .select('id, name, services_summary, services_full, therapeutic_areas, glp_certified, city, state, country, website, phone, address')
    .eq('id', cros_directory_id)
    .single();

  if (!dir?.name) {
    return NextResponse.json({ error: 'Directory entry not found' }, { status: 404 });
  }

  // Build profile fields from directory data (only set fields that have values)
  const fromDirectory: Record<string, unknown> = {
    company_name: dir.name,
    cros_directory_id,
    updated_at: new Date().toISOString(),
  };

  if (dir.services_summary) fromDirectory.company_overview = dir.services_summary;
  if (dir.services_full)    fromDirectory.facility_description = dir.services_full;

  // therapeutic_areas in directory is a comma-separated string; profile expects string[]
  if (dir.therapeutic_areas) {
    fromDirectory.therapeutic_areas = (dir.therapeutic_areas as string)
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  // Build accreditations from known flags
  const accreditations: string[] = [];
  if (dir.glp_certified) accreditations.push('GLP');
  if (accreditations.length) fromDirectory.accreditations = accreditations;

  // geographic_reach from location fields
  const locationParts = [dir.city, dir.state, dir.country].filter(Boolean);
  if (locationParts.length) fromDirectory.geographic_reach = locationParts.join(', ');

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.id) {
    // Update only the link + any fields that are currently blank
    // (don't overwrite data the user has already entered)
    const { data: current } = await supabase
      .from('cro_profiles')
      .select('company_overview, therapeutic_areas, facility_description, accreditations, geographic_reach')
      .eq('id', existing.id)
      .single();

    const safeUpdate: Record<string, unknown> = { cros_directory_id, updated_at: new Date().toISOString() };
    if (!current?.company_overview    && fromDirectory.company_overview)    safeUpdate.company_overview    = fromDirectory.company_overview;
    if (!current?.facility_description && fromDirectory.facility_description) safeUpdate.facility_description = fromDirectory.facility_description;
    if (!(current?.therapeutic_areas as unknown[])?.length && fromDirectory.therapeutic_areas) safeUpdate.therapeutic_areas = fromDirectory.therapeutic_areas;
    if (!(current?.accreditations as unknown[])?.length    && fromDirectory.accreditations)    safeUpdate.accreditations    = fromDirectory.accreditations;
    if (!current?.geographic_reach    && fromDirectory.geographic_reach)    safeUpdate.geographic_reach    = fromDirectory.geographic_reach;

    await supabase.from('cro_profiles').update(safeUpdate).eq('id', existing.id);
  } else {
    // No profile yet — create one pre-populated from directory data
    await supabase.from('cro_profiles').insert({ user_id: user.id, ...fromDirectory });
  }

  return NextResponse.json({ linked: true });
}

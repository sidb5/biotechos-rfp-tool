import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function DELETE(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let entryId: string;
  try {
    const body = await request.json();
    entryId = body.id;
    if (!entryId) throw new Error('missing id');
  } catch {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Verify ownership via RLS — fetch with cro_id scoped to this user
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('content_library')
    .delete()
    .eq('id', entryId)
    .eq('cro_id', profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

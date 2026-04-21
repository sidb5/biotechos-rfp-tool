// GET /api/knowledge-repo/list
// Returns all knowledge repo docs for the authenticated CRO user.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: docs, error } = await supabase
    .from('knowledge_repo_docs')
    .select('id, filename, file_type, created_at')
    .eq('cro_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ docs: docs ?? [] });
}

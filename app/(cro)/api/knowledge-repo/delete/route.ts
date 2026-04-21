// DELETE /api/knowledge-repo/delete
// Body: { id: string }

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function DELETE(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let docId: string;
  try {
    const body = await request.json();
    docId = body.id;
    if (!docId) throw new Error('missing id');
  } catch {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('knowledge_repo_docs')
    .delete()
    .eq('id', docId)
    .eq('cro_user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

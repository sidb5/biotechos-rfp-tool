// DELETE /api/biotech/engagements/[id]
// Deletes an engagement that is still in enquiry_draft stage.
// Also deletes all associated messages (engagement_messages FK cascade or explicit).
// Returns { deleted: true } on success.
//
// PATCH /api/biotech/engagements/[id]
// Archives a sent engagement (sets archived=true). Works at any stage.
// Returns { archived: true } on success.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  // Verify ownership and that stage is deletable
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, stage')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  if (engagement.stage !== 'enquiry_draft') {
    return NextResponse.json(
      { error: 'Only draft engagements (not yet sent) can be deleted' },
      { status: 422 }
    );
  }

  // Delete messages first (in case no DB-level cascade)
  await supabase
    .from('engagement_messages')
    .delete()
    .eq('engagement_id', engagementId);

  // Delete the engagement
  const { error } = await supabase
    .from('cro_engagements')
    .delete()
    .eq('id', engagementId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[engagement/delete]', error);
    return NextResponse.json({ error: 'Failed to delete engagement' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const { error } = await supabase
    .from('cro_engagements')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('id', engagementId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[engagement/archive]', error);
    return NextResponse.json({ error: 'Failed to archive engagement' }, { status: 500 });
  }

  return NextResponse.json({ archived: true });
}

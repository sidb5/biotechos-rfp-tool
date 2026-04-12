// PATCH /api/biotech/engagements/[id]/stage
// Manually sets an engagement's stage.
// Forward: any stage → awarded | closed
// Revert:  awarded | closed → rfp_sent  (allows undoing a mis-click)
// Used by outcome buttons in the thread UI.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

const ALLOWED_STAGES = ['awarded', 'closed', 'rfp_sent'] as const;
type AllowedStage = typeof ALLOWED_STAGES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { stage?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { stage } = body;
  if (!stage || !(ALLOWED_STAGES as readonly string[]).includes(stage)) {
    return NextResponse.json(
      { error: `stage must be one of: ${ALLOWED_STAGES.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, stage')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('cro_engagements')
    .update({ stage: stage as AllowedStage, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) {
    console.error('[stage PATCH]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true, stage });
}

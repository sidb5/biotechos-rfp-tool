// PATCH /api/biotech/engagements/[id]/gap-resolve
// Toggles a gap analysis item as resolved/unresolved.
// Updates ai_metadata.resolved_items on the specific followup draft message.
// Body: { message_id: string, item_text: string, resolved: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { message_id, item_text, resolved } = body as {
    message_id?: string;
    item_text?:  string;
    resolved?:   boolean;
  };

  if (!message_id || !item_text || typeof resolved !== 'boolean') {
    return NextResponse.json({ error: 'message_id, item_text, and resolved are required' }, { status: 400 });
  }

  // Verify message belongs to this engagement + user
  const { data: msg } = await supabase
    .from('engagement_messages')
    .select('id, ai_metadata, cro_engagements!inner(user_id)')
    .eq('id', message_id)
    .eq('engagement_id', engagementId)
    .single();

  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  // Check ownership through the joined engagement
  const engRow = msg.cro_engagements as unknown as { user_id: string } | { user_id: string }[];
  const ownerId = Array.isArray(engRow) ? engRow[0]?.user_id : engRow?.user_id;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Update resolved_items in ai_metadata
  const existing = (msg.ai_metadata ?? {}) as { gap_analysis?: unknown; resolved_items?: string[] };
  const currentResolved: string[] = existing.resolved_items ?? [];

  let updatedResolved: string[];
  if (resolved) {
    updatedResolved = currentResolved.includes(item_text)
      ? currentResolved
      : [...currentResolved, item_text];
  } else {
    updatedResolved = currentResolved.filter(t => t !== item_text);
  }

  await supabase
    .from('engagement_messages')
    .update({
      ai_metadata: { ...existing, resolved_items: updatedResolved },
    })
    .eq('id', message_id);

  return NextResponse.json({ resolved_items: updatedResolved });
}

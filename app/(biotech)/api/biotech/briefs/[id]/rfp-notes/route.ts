// POST   /api/biotech/briefs/[id]/rfp-notes  — add a note (idempotent by text)
// DELETE /api/biotech/briefs/[id]/rfp-notes  — remove a note by note_id
//
// rfp_context_notes lives on rfp_internal_briefs as a jsonb array.
// It accumulates selected items from meeting debrief panels across ALL
// engagements that belong to this brief. Task 6.1 reads this array when
// generating the full RFP.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { randomUUID } from 'crypto';

interface RfpNote {
  id:                   string;
  text:                 string;
  type:                 'rfp_refinement' | 'open_question';
  source_engagement_id: string;
  source_cro_name:      string;
  added_at:             string;
}

// ── POST — add a note ─────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { text, type, source_engagement_id, source_cro_name } = body as {
    text?:                 string;
    type?:                 'rfp_refinement' | 'open_question';
    source_engagement_id?: string;
    source_cro_name?:      string;
  };

  if (!text?.trim() || !type || !source_engagement_id) {
    return NextResponse.json({ error: 'text, type, and source_engagement_id are required' }, { status: 400 });
  }

  // Load existing notes (and verify brief ownership via RLS)
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('rfp_context_notes')
    .eq('id', briefId)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  const existing = (brief.rfp_context_notes ?? []) as RfpNote[];

  // Idempotent — if same text already saved, return existing note_id
  const duplicate = existing.find(n => n.text.trim() === text.trim());
  if (duplicate) {
    return NextResponse.json({ note_id: duplicate.id, notes: existing });
  }

  const newNote: RfpNote = {
    id:                   randomUUID(),
    text:                 text.trim(),
    type,
    source_engagement_id,
    source_cro_name:      source_cro_name ?? '',
    added_at:             new Date().toISOString(),
  };

  const updated = [...existing, newNote];

  const { error } = await supabase
    .from('rfp_internal_briefs')
    .update({ rfp_context_notes: updated })
    .eq('id', briefId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[rfp-notes POST]', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }

  return NextResponse.json({ note_id: newNote.id, notes: updated });
}

// ── DELETE — remove a note ────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { note_id } = body as { note_id?: string };
  if (!note_id) return NextResponse.json({ error: 'note_id is required' }, { status: 400 });

  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('rfp_context_notes')
    .eq('id', briefId)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  const updated = ((brief.rfp_context_notes ?? []) as RfpNote[])
    .filter(n => n.id !== note_id);

  const { error } = await supabase
    .from('rfp_internal_briefs')
    .update({ rfp_context_notes: updated })
    .eq('id', briefId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[rfp-notes DELETE]', error);
    return NextResponse.json({ error: 'Failed to remove note' }, { status: 500 });
  }

  return NextResponse.json({ notes: updated });
}

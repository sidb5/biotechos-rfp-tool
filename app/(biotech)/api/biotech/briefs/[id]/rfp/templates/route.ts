// GET  /api/biotech/briefs/[id]/rfp/templates — load user's section defaults
// POST /api/biotech/briefs/[id]/rfp/templates — save a section as user default
// DELETE /api/biotech/briefs/[id]/rfp/templates — remove a section default
//
// Templates stored in biotech_user_settings.rfp_section_defaults (jsonb).
// Shape: { s1_header: "...", s3_scope: "...", ... }
// When a user saves a section as template, that content becomes the editable
// starting point for the same section on future RFPs (pre-populated, not locked).

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { SECTION_KEYS, type SectionKey } from '@biotech/prompts/rfp';

export async function GET(
  _req: NextRequest,
  _ctx: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data } = await supabase
      .from('biotech_user_settings')
      .select('rfp_section_defaults')
      .eq('user_id', user.id)
      .maybeSingle();
    return NextResponse.json({ templates: (data?.rfp_section_defaults ?? {}) as Record<string, string> });
  } catch {
    return NextResponse.json({ templates: {} });
  }
}

export async function POST(
  req: NextRequest,
  _ctx: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { section?: string; content?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { section, content } = body;
  if (!section || !(SECTION_KEYS as readonly string[]).includes(section)) {
    return NextResponse.json({ error: 'Invalid section key' }, { status: 400 });
  }
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  // Load existing templates
  let existing: Record<string, string> = {};
  try {
    const { data } = await supabase
      .from('biotech_user_settings')
      .select('rfp_section_defaults')
      .eq('user_id', user.id)
      .maybeSingle();
    existing = (data?.rfp_section_defaults ?? {}) as Record<string, string>;
  } catch { /* column not yet migrated — start fresh */ }

  const updated = { ...existing, [section as SectionKey]: content.trim() };

  // Upsert into user settings
  const { error } = await supabase
    .from('biotech_user_settings')
    .upsert(
      { user_id: user.id, rfp_section_defaults: updated, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[rfp/templates POST]', error.message);
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }

  return NextResponse.json({ saved: true, templates: updated });
}

export async function DELETE(
  req: NextRequest,
  _ctx: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { section?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { section } = body;
  if (!section) return NextResponse.json({ error: 'section is required' }, { status: 400 });

  let existing: Record<string, string> = {};
  try {
    const { data } = await supabase
      .from('biotech_user_settings')
      .select('rfp_section_defaults')
      .eq('user_id', user.id)
      .maybeSingle();
    existing = (data?.rfp_section_defaults ?? {}) as Record<string, string>;
  } catch { /* ignore */ }

  const { [section]: _removed, ...updated } = existing;
  void _removed;

  await supabase
    .from('biotech_user_settings')
    .upsert(
      { user_id: user.id, rfp_section_defaults: updated, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  return NextResponse.json({ deleted: true, templates: updated });
}

// POST /api/biotech/engagements/[id]/quote
// Logs a received quote and advances stage to quote_received.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { quoted_amount, quoted_currency, quoted_timeline, quote_valid_until, quote_notes } =
    body as {
      quoted_amount?:    number;
      quoted_currency?:  string;
      quoted_timeline?:  string;
      quote_valid_until?: string | null;
      quote_notes?:      string;
    };

  if (!quoted_amount || isNaN(quoted_amount)) {
    return NextResponse.json({ error: 'quoted_amount is required' }, { status: 400 });
  }

  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const { error } = await supabase
    .from('cro_engagements')
    .update({
      stage:            'quote_received',
      quoted_amount,
      quoted_currency:  quoted_currency ?? 'USD',
      quoted_timeline:  quoted_timeline ?? null,
      quote_valid_until: quote_valid_until ?? null,
      quote_notes:      quote_notes ?? null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

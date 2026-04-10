import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { sendEmail } from '@shared/lib/email';

// POST /api/email/send
// Internal route for triggered email sends. Not exposed to end users directly.
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { template_name?: string; to?: string; subject?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { template_name, to, subject, html } = body;
  if (!template_name || !to || !subject || !html) {
    return NextResponse.json({ error: 'template_name, to, subject, html are required' }, { status: 400 });
  }

  const result = await sendEmail({ to, subject, html, templateName: template_name, userId: user.id });
  return NextResponse.json(result);
}

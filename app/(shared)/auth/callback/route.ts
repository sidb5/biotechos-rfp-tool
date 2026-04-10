import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { sendEmail } from '@shared/lib/email';
import { welcomeTemplate } from '@shared/lib/email-templates';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Send welcome email for brand-new accounts (created within last 10 min)
      const user = data.session.user;
      const createdAt = user.created_at;
      const isNew = createdAt && Date.now() - new Date(createdAt).getTime() < 10 * 60 * 1000;
      if (isNew) {
        const prefix = (user.email ?? '').split('@')[0];
        const firstName = prefix.split(/[._+-]/)[0];
        const name = firstName.length >= 2
          ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
          : undefined;
        const { subject, html } = welcomeTemplate({ firstName: name });
        sendEmail({
          to: user.email!,
          subject,
          html,
          templateName: 'welcome',
          userId: user.id,
        }).catch(console.error);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

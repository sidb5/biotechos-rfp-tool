import { NextResponse }              from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { sendEmail }                  from '@shared/lib/email';
import { welcomeTemplate }            from '@shared/lib/email-templates';
import { checkCorporateEmail }        from '@shared/lib/email-domain';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Corporate-domain gate (Task 13) — enforce server-side for OAuth flows
      const user = data.session.user;
      const domainCheck = checkCorporateEmail(user.email ?? '');
      if (!domainCheck.ok) {
        // Sign the user back out — they shouldn't have an active session
        await supabase.auth.signOut();
        const msg = encodeURIComponent(domainCheck.message ?? 'Work email required');
        return NextResponse.redirect(`${origin}/auth/error?error=${msg}`);
      }

      // Send welcome email for brand-new accounts (created within last 10 min)
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

      // Route to the correct dashboard based on user type set at signup.
      // The `next` param from the URL takes precedence if explicitly set.
      // Otherwise fall back to the type-appropriate default.
      const hasExplicitNext = searchParams.has('next');
      let destination = next;
      if (!hasExplicitNext) {
        const userType = user.user_metadata?.user_type ?? 'cro';
        destination = userType === 'biotech' ? '/biotech/dashboard' : '/dashboard';
      }

      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

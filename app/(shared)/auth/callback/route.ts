import { NextResponse }              from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { sendEmail }                  from '@shared/lib/email';
import { welcomeTemplate }            from '@shared/lib/email-templates';
import { checkCorporateEmail }        from '@shared/lib/email-domain';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get('code');
  const next     = searchParams.get('next') ?? '/dashboard';
  // `type` is passed via redirectTo when the user clicks an OAuth button so we
  // know which persona they selected (cro | biotech). Used to:
  //   1. Set user_type metadata on brand-new OAuth accounts.
  //   2. Route correctly when `next` is not in the URL (shouldn't happen but safe fallback).
  const typeParam = searchParams.get('type') as 'cro' | 'biotech' | null;

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // ── Corporate-domain gate — enforced server-side for ALL OAuth flows ──
      const user = data.session.user;
      const domainCheck = checkCorporateEmail(user.email ?? '');
      if (!domainCheck.ok) {
        await supabase.auth.signOut();
        const msg = encodeURIComponent(domainCheck.message ?? 'Work email required');
        return NextResponse.redirect(`${origin}/auth/error?error=${msg}`);
      }

      // ── New account handling ───────────────────────────────────────────────
      const createdAt = user.created_at;
      const isNew = createdAt && Date.now() - new Date(createdAt).getTime() < 10 * 60 * 1000;

      if (isNew) {
        // For OAuth signups, user_type isn't set by the provider — set it now
        // using the persona the user selected before clicking Google/Microsoft.
        if (typeParam && !user.user_metadata?.user_type) {
          await supabase.auth.updateUser({ data: { user_type: typeParam } });
        }

        // Welcome email — use provider-supplied full_name if available
        const metaName  = user.user_metadata?.full_name as string | undefined;
        const prefix    = (user.email ?? '').split('@')[0];
        const firstWord = (metaName ?? prefix).split(/[\s._+-]/)[0];
        const firstName = firstWord.length >= 2
          ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1)
          : undefined;
        const { subject, html } = welcomeTemplate({ firstName });
        sendEmail({
          to: user.email!,
          subject,
          html,
          templateName: 'welcome',
          userId: user.id,
        }).catch(console.error);
      }

      // ── Routing ───────────────────────────────────────────────────────────
      // `next` is always set when coming from an OAuth button (we put it in
      // redirectTo). Fall back to metadata / typeParam for edge cases.
      const hasExplicitNext = searchParams.has('next');
      let destination = next;
      if (!hasExplicitNext) {
        const resolvedType =
          (user.user_metadata?.user_type as string | undefined) ?? typeParam ?? 'cro';
        destination = resolvedType === 'biotech' ? '/biotech/dashboard' : '/dashboard';
      }

      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

// POST /api/admin/signup
// Creates a Supabase auth account + admin_users row (approved=false).
// Sends approval email to APP_ADMINISTRATOR.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendEmail } from '@shared/lib/email';
import { adminApprovalTemplate } from '@shared/lib/email-templates';

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let body: { email?: string; password?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const adminEmail = process.env.APP_ADMINISTRATOR;
  if (!adminEmail) {
    console.error('[admin/signup] APP_ADMINISTRATOR env var not set');
    return NextResponse.json({ error: 'Admin system not configured' }, { status: 500 });
  }

  // Check if already registered as admin
  const { data: existing } = await supabase
    .from('admin_users')
    .select('id, approved')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    // If APP_ADMINISTRATOR is re-registering and was previously pending, auto-approve
    if (!existing.approved && email.toLowerCase() === adminEmail.toLowerCase()) {
      await supabase
        .from('admin_users')
        .update({ approved: true, approval_token: null, approval_token_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      return NextResponse.json({ ok: true, approved: true, message: 'Admin account approved. You can log in now.' });
    }
    if (existing.approved) {
      return NextResponse.json({ error: 'Account already exists — please log in' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Account pending approval — check with your administrator' }, { status: 409 });
  }

  // Create Supabase auth user with admin metadata, or reuse existing auth user
  let userId: string;

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { user_type: 'admin' },
  });

  if (authErr?.message?.includes('already been registered')) {
    // Existing platform user — look up their auth ID and grant admin access
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = users?.find(u => u.email === email);
    if (!existingUser) {
      return NextResponse.json({ error: 'Failed to find existing account' }, { status: 500 });
    }
    userId = existingUser.id;
  } else if (authErr || !authData?.user) {
    console.error('[admin/signup] auth.admin.createUser failed:', authErr);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  } else {
    userId = authData.user.id;
  }

  // Auto-approve if the signup email IS the APP_ADMINISTRATOR
  const isOwner = email.toLowerCase() === adminEmail.toLowerCase();

  if (isOwner) {
    const { error: insertErr } = await supabase
      .from('admin_users')
      .insert({
        user_id: userId,
        email,
        approved: true,
      });

    if (insertErr) {
      console.error('[admin/signup] admin_users insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, approved: true, message: 'Admin account created and auto-approved. You can log in now.' });
  }

  // For other signups: pending approval + send email to APP_ADMINISTRATOR
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase
    .from('admin_users')
    .insert({
      user_id: userId,
      email,
      approved: false,
      approval_token: token,
      approval_token_expires_at: expiresAt,
    });

  if (insertErr) {
    console.error('[admin/signup] admin_users insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 });
  }

  const { subject, html } = adminApprovalTemplate({ adminEmail: email, token });
  await sendEmail({
    to: adminEmail,
    subject,
    html,
    templateName: 'admin_approval',
    userId,
  });

  return NextResponse.json({ ok: true, message: 'Account created — pending administrator approval' });
}

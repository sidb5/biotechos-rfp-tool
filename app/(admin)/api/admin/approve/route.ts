// GET /api/admin/approve?token=xxx
// Validates approval token and activates the admin account.
// Returns an HTML page (not JSON) since this is clicked from an email.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return htmlResponse('Missing token', 'The approval link is invalid.', false);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, email, approved, approval_token_expires_at')
    .eq('approval_token', token)
    .maybeSingle();

  if (!admin) {
    return htmlResponse('Invalid token', 'This approval link is invalid or has already been used.', false);
  }

  if (admin.approved) {
    return htmlResponse('Already approved', `${admin.email} is already an approved admin.`, true);
  }

  if (admin.approval_token_expires_at && new Date(admin.approval_token_expires_at) < new Date()) {
    return htmlResponse('Token expired', 'This approval link has expired. The admin will need to sign up again.', false);
  }

  // Approve the admin
  const { error } = await supabase
    .from('admin_users')
    .update({
      approved: true,
      approval_token: null,
      approval_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', admin.id);

  if (error) {
    console.error('[admin/approve] update failed:', error);
    return htmlResponse('Error', 'Failed to approve the account. Please try again.', false);
  }

  return htmlResponse('Approved', `${admin.email} has been approved as an admin. They can now log in at /admin/login.`, true);
}

function htmlResponse(title: string, message: string, success: boolean): NextResponse {
  const color = success ? '#16a34a' : '#dc2626';
  const icon = success ? '✓' : '✗';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${title} — BiotechOS Admin</title></head>
<body style="margin:0;padding:0;background:#f0f2f7;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:12px;border:1px solid #cbd1de;padding:40px;max-width:440px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="width:48px;height:48px;border-radius:50%;background:${color};color:#fff;font-size:24px;font-weight:bold;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">${icon}</div>
    <h1 style="margin:0 0 8px;font-size:20px;color:#1f2937;">${title}</h1>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">${message}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}

// ─── Email Templates ──────────────────────────────────────────────────────────
// All templates return { subject, html } for use with Resend.
// Design: white background, clean sans-serif, green CTA buttons, plain footer.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app';

function base(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CRO Proposal Engine</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#16a34a;padding:20px 32px;">
            <p style="margin:0;color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">CRO Proposal Engine</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
              You're receiving this because you have an account on CRO Proposal Engine.<br/>
              <a href="${APP_URL}/settings/notifications" style="color:#9ca3af;">Manage email preferences</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string, color = '#16a34a'): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${color};color:#ffffff;font-weight:600;font-size:14px;border-radius:8px;text-decoration:none;">${label}</a>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">${text}</p>`;
}

function badge(label: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${color};font-size:12px;font-weight:600;">${label}</span>`;
}

// ─── Template 1 — RFP parsed successfully ─────────────────────────────────────

export function rfpParsedTemplate(props: {
  biotechName: string;
  studyType: string;
  rfpId: string;
  croName: string;
}): { subject: string; html: string } {
  const url = `${APP_URL}/rfp/new`;
  return {
    subject: `RFP from ${props.biotechName} is ready to review`,
    html: base(`
      ${h1(`RFP from ${props.biotechName} parsed`)}
      ${p(`Hi ${props.croName}, your RFP has been successfully parsed and is ready for review.`)}
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
        <tr><td><p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Study type</p>
        <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">${props.studyType || 'Not specified'}</p></td></tr>
        <tr><td style="padding-top:12px;"><p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Sponsor</p>
        <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">${props.biotechName}</p></td></tr>
      </table>
      ${p('A bid/no-bid recommendation has been generated based on your profile.')}
      <div style="margin-top:8px;">${btn(url, 'Review RFP →')}</div>
    `),
  };
}

// ─── Template 2 — Deadline reminder ───────────────────────────────────────────

export function deadlineReminderTemplate(props: {
  biotechName: string;
  proposalId: string;
  deadlineDate: string;
  daysRemaining: number;
  croName: string;
}): { subject: string; html: string } {
  const url = `${APP_URL}/proposals/${props.proposalId}`;
  const urgentColor = props.daysRemaining <= 2 ? '#dc2626' : '#d97706';
  return {
    subject: `Reminder: Proposal for ${props.biotechName} due in ${props.daysRemaining} day${props.daysRemaining !== 1 ? 's' : ''}`,
    html: base(`
      ${h1(`Proposal deadline approaching`)}
      ${p(`Hi ${props.croName}, your proposal for <strong>${props.biotechName}</strong> is due soon.`)}
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9f0;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:20px;">
        <tr><td align="center">
          <p style="margin:0;font-size:32px;font-weight:800;color:${urgentColor};">${props.daysRemaining} day${props.daysRemaining !== 1 ? 's' : ''}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#92400e;">Due: ${props.deadlineDate}</p>
        </td></tr>
      </table>
      ${p('Your proposal is still in draft. Finish and export it before the deadline.')}
      <div style="margin-top:8px;">${btn(url, 'Continue editing proposal →', urgentColor)}</div>
    `),
  };
}

// ─── Template 3 — Proposal completed ──────────────────────────────────────────

export function proposalCompleteTemplate(props: {
  biotechName: string;
  proposalId: string;
  croName: string;
  studyType: string;
}): { subject: string; html: string } {
  const url = `${APP_URL}/proposals/${props.proposalId}`;
  return {
    subject: `Proposal for ${props.biotechName} is complete`,
    html: base(`
      ${h1(`Your proposal is ready`)}
      ${p(`Hi ${props.croName}, all sections of your proposal for <strong>${props.biotechName}</strong> have been generated.`)}
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Study</p>
          <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">${props.studyType}</p>
          <p style="margin:8px 0 4px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Sponsor</p>
          <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">${props.biotechName}</p>
        </td></tr>
      </table>
      ${p('Review the content, fill in the pricing section, then export to PDF or Word.')}
      <div style="margin-top:8px;">${btn(url, 'View proposal →')}</div>
    `),
  };
}

// ─── Template 4 — Win recorded ────────────────────────────────────────────────

export function winRecordedTemplate(props: {
  biotechName: string;
  proposalId: string;
  croName: string;
  contractValue?: number | null;
}): { subject: string; html: string } {
  const url = `${APP_URL}/proposals/${props.proposalId}`;
  const valueStr = props.contractValue
    ? `$${props.contractValue.toLocaleString('en-US')}`
    : null;
  return {
    subject: `Congratulations — ${props.biotechName} proposal won!`,
    html: base(`
      ${h1(`🎉 You won the ${props.biotechName} proposal!`)}
      ${p(`Congratulations ${props.croName}! Record this win in your analytics to track your performance over time.`)}
      ${valueStr ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:20px;text-align:center;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:13px;color:#166534;">Contract value</p>
          <p style="margin:0;font-size:32px;font-weight:800;color:#15803d;">${valueStr}</p>
        </td></tr>
      </table>` : ''}
      ${p('Keep up the great work. Head to Analytics to see your running win rate.')}
      <div style="margin-top:8px;">${btn(url, 'View winning proposal →')}</div>
    `),
  };
}

// ─── Template 5 — Weekly summary ──────────────────────────────────────────────

export function weeklySummaryTemplate(props: {
  croName: string;
  proposalsCreated: number;
  proposalsWon: number;
  rfpsReceived: number;
  hoursSaved: number;
  pendingProposals: { biotechName: string; proposalId: string }[];
}): { subject: string; html: string } {
  const analyticsUrl = `${APP_URL}/analytics`;
  const pendingRows = props.pendingProposals.slice(0, 5).map(p =>
    `<tr><td style="padding:6px 0;font-size:13px;color:#374151;">→ <a href="${APP_URL}/proposals/${p.proposalId}" style="color:#16a34a;font-weight:600;">${p.biotechName}</a></td></tr>`
  ).join('');

  return {
    subject: `Your weekly CRO RFP summary`,
    html: base(`
      ${h1(`Weekly summary`)}
      ${p(`Hi ${props.croName}, here's how your week looked.`)}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td width="25%" align="center" style="padding:12px;background:#f9fafb;border-radius:8px;margin:4px;">
            <p style="margin:0;font-size:26px;font-weight:800;color:#111827;">${props.proposalsCreated}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Proposals created</p>
          </td>
          <td width="4%"></td>
          <td width="25%" align="center" style="padding:12px;background:#f0fdf4;border-radius:8px;">
            <p style="margin:0;font-size:26px;font-weight:800;color:#15803d;">${props.proposalsWon}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Proposals won</p>
          </td>
          <td width="4%"></td>
          <td width="25%" align="center" style="padding:12px;background:#f9fafb;border-radius:8px;">
            <p style="margin:0;font-size:26px;font-weight:800;color:#111827;">${props.rfpsReceived}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">RFPs received</p>
          </td>
          <td width="4%"></td>
          <td width="25%" align="center" style="padding:12px;background:#eff6ff;border-radius:8px;">
            <p style="margin:0;font-size:26px;font-weight:800;color:#1d4ed8;">~${props.hoursSaved}h</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Hours saved</p>
          </td>
        </tr>
      </table>
      ${props.pendingProposals.length > 0 ? `
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Proposals needing attention:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          ${pendingRows}
        </table>` : ''}
      <div style="margin-top:8px;">${btn(analyticsUrl, 'View Analytics →')}</div>
    `),
  };
}

// ─── Auth Templates ────────────────────────────────────────────────────────────
// Used by /api/auth/* routes and sent via Resend.
// Supabase's own emails are replaced by pointing emailRedirectTo at our routes.

export function confirmSignupTemplate(props: {
  confirmUrl: string;
}): { subject: string; html: string } {
  return {
    subject: 'Confirm your Proposal Engine account',
    html: base(`
      ${h1('Welcome to Proposal Engine')}
      ${p('Reply to any client request in hours, not days — turn emails, PDFs, and RFPs into professional proposals without pulling your scientists into sales.')}
      ${p('Click the button below to confirm your email address and activate your account.')}
      <div style="margin:24px 0;">${btn(props.confirmUrl, 'Confirm my account →')}</div>
      ${p('<span style="color:#6b7280;font-size:13px;">If you didn\'t create an account, you can safely ignore this email.</span>')}
    `),
  };
}

export function passwordResetTemplate(props: {
  resetUrl: string;
}): { subject: string; html: string } {
  return {
    subject: 'Reset your Proposal Engine password',
    html: base(`
      ${h1('Password reset requested')}
      ${p('We received a request to reset the password for your Proposal Engine account.')}
      ${p('Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.')}
      <div style="margin:24px 0;">${btn(props.resetUrl, 'Reset password →', '#dc2626')}</div>
      ${p('<span style="color:#6b7280;font-size:13px;">If you didn\'t request a password reset, your account is safe — you can ignore this email.</span>')}
    `),
  };
}

export function magicLinkTemplate(props: {
  loginUrl: string;
}): { subject: string; html: string } {
  return {
    subject: 'Your login link for Proposal Engine',
    html: base(`
      ${h1('Here\'s your login link')}
      ${p('Click the button below to sign in to Proposal Engine. This link expires in <strong>10 minutes</strong> and can only be used once.')}
      <div style="margin:24px 0;">${btn(props.loginUrl, 'Log in now →')}</div>
      ${p('<span style="color:#6b7280;font-size:13px;">If you didn\'t request this link, you can safely ignore this email.</span>')}
    `),
  };
}

export function emailChangeTemplate(props: {
  oldEmail: string;
  newEmail: string;
  confirmUrl: string;
}): { subject: string; html: string } {
  return {
    subject: 'Confirm your new email address — Proposal Engine',
    html: base(`
      ${h1('Email change requested')}
      ${p('A request was made to change the email address on your Proposal Engine account.')}
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <tr>
          <td style="padding:6px 0;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Current email</p>
            <p style="margin:4px 0 0;font-size:14px;color:#374151;">${props.oldEmail}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0 6px;border-top:1px solid #e5e7eb;margin-top:8px;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#16a34a;">New email</p>
            <p style="margin:4px 0 0;font-size:14px;color:#111827;font-weight:600;">${props.newEmail}</p>
          </td>
        </tr>
      </table>
      ${p('Click the button below to confirm your new email address.')}
      <div style="margin:24px 0;">${btn(props.confirmUrl, 'Confirm new email →')}</div>
      ${p('<span style="color:#dc2626;font-size:13px;font-weight:600;">If you didn\'t request this change, contact support immediately at support@cro-rfp-tool.com.</span>')}
    `),
  };
}

export function welcomeTemplate(props: {
  firstName?: string;
}): { subject: string; html: string } {
  const name = props.firstName ? `, ${props.firstName}` : '';
  return {
    subject: "You're in — here's how to get your first proposal done in 1 hour",
    html: base(`
      ${h1(`Welcome to Proposal Engine${name}!`)}
      ${p('You can now respond to any client request — email, PDF, or formal RFP — in hours instead of days. Here\'s how to get started:')}

      <!-- Step 1 -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
        <tr>
          <td width="32" valign="top">
            <div style="width:24px;height:24px;border-radius:50%;background:#16a34a;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px;">1</div>
          </td>
          <td style="padding-left:12px;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Complete your CRO profile</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Your profile is used to personalise every proposal — takes about 10 minutes.</p>
            <a href="${APP_URL}/profile" style="font-size:13px;color:#16a34a;font-weight:600;">Set up profile →</a>
          </td>
        </tr>
      </table>

      <!-- Step 2 -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
        <tr>
          <td width="32" valign="top">
            <div style="width:24px;height:24px;border-radius:50%;background:#16a34a;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px;">2</div>
          </td>
          <td style="padding-left:12px;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Paste or upload your first client request</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Works with emails, PDFs, Word docs, or just a paragraph of text.</p>
            <a href="${APP_URL}/dashboard" style="font-size:13px;color:#16a34a;font-weight:600;">Go to dashboard →</a>
          </td>
        </tr>
      </table>

      <!-- Step 3 -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="32" valign="top">
            <div style="width:24px;height:24px;border-radius:50%;background:#16a34a;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px;">3</div>
          </td>
          <td style="padding-left:12px;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Review, edit pricing, and send</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">AI writes every section. You review, fill in the pricing table, then share a link or export to PDF.</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-align:center;">⏱ Takes about 60 minutes the first time — 45 minutes for every proposal after that.</p>
      <div style="text-align:center;">${btn(`${APP_URL}/dashboard`, 'Get started →')}</div>
    `),
  };
}

// ─── Template 6 — Team invitation (for Task 26) ───────────────────────────────

export function teamInviteTemplate(props: {
  inviterName: string;
  orgName: string;
  token: string;
}): { subject: string; html: string } {
  const url = `${APP_URL}/invite/${props.token}`;
  return {
    subject: `${props.inviterName} invited you to join ${props.orgName} on CRO Proposal Engine`,
    html: base(`
      ${h1(`You've been invited`)}
      ${p(`<strong>${props.inviterName}</strong> has invited you to join <strong>${props.orgName}</strong> on CRO Proposal Engine.`)}
      ${p('CRO Proposal Engine helps contract research organisations respond to RFPs in hours instead of days — cut proposal time from 30+ hours to 3.')}
      <div style="margin-top:8px;">${btn(url, 'Accept invitation →')}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This invitation expires in 7 days.</p>
    `),
  };
}

// ─── Template 7 — Admin approval request ────────────────────────────────────

export function adminApprovalTemplate(props: {
  adminEmail: string;
  token: string;
}): { subject: string; html: string } {
  const url = `${APP_URL}/api/admin/approve?token=${props.token}`;
  return {
    subject: `[BiotechOS Admin] New admin signup requires approval: ${props.adminEmail}`,
    html: base(`
      ${h1('New admin signup')}
      ${p(`<strong>${props.adminEmail}</strong> has requested admin access to the BiotechOS platform.`)}
      ${p('Click the button below to approve their account. If you do not recognise this request, ignore this email.')}
      <div style="margin-top:8px;">${btn(url, 'Approve admin account →', '#2563eb')}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This approval link expires in 24 hours.</p>
    `),
  };
}

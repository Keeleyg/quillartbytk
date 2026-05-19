import type { Env } from './index';
import type { InquiryData } from './inquiry';

const FROM = 'Quill Art by TK <inquiries@quillartbytk.com>';
const ADMIN_EMAIL = 'quillartbytk@gmail.com';
const RESEND_API = 'https://api.resend.com/emails';

/** Escape HTML special characters for safe embedding in email HTML */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert newlines to <br> for HTML emails */
function nl2br(str: string): string {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

/* ------------------------------------------------------------------ */
/*  Shared HTML wrapper                                               */
/* ------------------------------------------------------------------ */
function htmlWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fdfcfa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdfcfa;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:24px 32px;background-color:#ffffff;border:1px solid #e8e7e5;border-radius:8px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#7a7a8a;">
            Quill Art by TK &middot; <a href="https://quillartbytk.com" style="color:#7a7a8a;">quillartbytk.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Admin notification                                                */
/* ------------------------------------------------------------------ */
export async function sendAdminNotification(data: InquiryData, env: Env): Promise<void> {
  const subjectLine = [
    'New inquiry:',
    data.subject || 'general',
    data.ref ? `[ref: ${data.ref}]` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Plain text
  const lines: string[] = [
    'New inquiry from your website:',
    '',
    `Name: ${data.name}`,
    `Email: ${data.email}`,
  ];
  if (data.subject) lines.push(`Subject: ${data.subject}`);
  if (data.ref) lines.push(`Product reference: ${data.ref}`);
  lines.push('', 'Message:', data.message, '', '—', `Reply to this email to respond directly to ${data.name}.`);
  const text = lines.join('\n');

  // HTML
  let detailRows = `
    <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;width:120px;">Name:</td><td style="padding:4px 0;">${escapeHtml(data.name)}</td></tr>
    <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Email:</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(data.email)}" style="color:#8b3a3a;">${escapeHtml(data.email)}</a></td></tr>`;
  if (data.subject) {
    detailRows += `<tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Subject:</td><td style="padding:4px 0;">${escapeHtml(data.subject)}</td></tr>`;
  }
  if (data.ref) {
    detailRows += `<tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Reference:</td><td style="padding:4px 0;">${escapeHtml(data.ref)}</td></tr>`;
  }

  const html = htmlWrapper(`
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">New inquiry from your website</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;">
      ${detailRows}
    </table>
    <div style="margin:20px 0 0;padding:16px;background-color:#fdfcfa;border-radius:6px;border:1px solid #e8e7e5;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#7a7a8a;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
      <p style="margin:0;font-size:14px;line-height:1.6;">${nl2br(data.message)}</p>
    </div>
    <p style="margin:20px 0 0;font-size:13px;color:#7a7a8a;">— Reply to this email to respond directly to ${escapeHtml(data.name)}.</p>
  `);

  await sendEmail(
    {
      from: FROM,
      to: ADMIN_EMAIL,
      reply_to: data.email,
      subject: subjectLine,
      text,
      html,
    },
    env,
  );
}

/* ------------------------------------------------------------------ */
/*  Auto-reply to inquirer                                            */
/* ------------------------------------------------------------------ */
export async function sendAutoReply(data: InquiryData, env: Env): Promise<void> {
  const lines: string[] = [
    `Hi ${data.name},`,
    '',
    "Thanks for getting in touch about my quilling artwork! Your message",
    "has been received and I'll get back to you within 2–3 days.",
    '',
    "For reference, here's what you sent:",
    '',
  ];
  if (data.subject) lines.push(`Subject: ${data.subject}`);
  lines.push(data.message, '', "If you'd like to add anything, just reply to this email.", '', 'Warm regards,', 'Tracey', 'Quill Art by TK', 'https://quillartbytk.com');
  const text = lines.join('\n');

  let refBlock = '';
  if (data.subject) {
    refBlock = `<p style="margin:0 0 8px;font-size:14px;"><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>`;
  }

  const html = htmlWrapper(`
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(data.name)},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thanks for getting in touch about my quilling artwork! Your message has been received
      and I’ll get back to you within 2–3 days.
    </p>
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#7a7a8a;">For reference, here’s what you sent:</p>
    <div style="margin:0 0 16px;padding:16px;background-color:#fdfcfa;border-radius:6px;border:1px solid #e8e7e5;">
      ${refBlock}
      <p style="margin:0;font-size:14px;line-height:1.6;">${nl2br(data.message)}</p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      If you’d like to add anything, just reply to this email.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;">
      Warm regards,<br>
      <strong>Tracey</strong><br>
      <span style="color:#7a7a8a;">Quill Art by TK</span><br>
      <a href="https://quillartbytk.com" style="color:#8b3a3a;">quillartbytk.com</a>
    </p>
  `);

  await sendEmail(
    {
      from: FROM,
      to: data.email,
      reply_to: ADMIN_EMAIL,
      subject: 'Thanks for your inquiry — Quill Art by TK',
      text,
      html,
    },
    env,
  );
}

/* ------------------------------------------------------------------ */
/*  Resend API call                                                   */
/* ------------------------------------------------------------------ */
interface EmailPayload {
  from: string;
  to: string;
  reply_to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendEmail(payload: EmailPayload, env: Env): Promise<void> {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

import type { Env } from './index';
import { sendAdminNotification, sendAutoReply } from './email';

export interface InquiryData {
  name: string;
  email: string;
  subject: string;
  message: string;
  ref: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleInquiry(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Parse form body (application/x-www-form-urlencoded)
  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text);
  } catch {
    return jsonResponse({ ok: false, error: 'Could not parse form data.' }, 400);
  }

  // Honeypot: if "company" has any value, silently succeed (don't tip off bots)
  const honeypot = formData.get('company') ?? '';
  if (honeypot.trim().length > 0) {
    return jsonResponse({ ok: true }, 200);
  }

  // Extract and trim fields
  const name = (formData.get('name') ?? '').trim();
  const email = (formData.get('email') ?? '').trim();
  const subject = (formData.get('subject') ?? '').trim();
  const message = (formData.get('message') ?? '').trim();
  const ref = (formData.get('ref') ?? '').trim();

  // Validate
  if (!name || name.length > 100) {
    return jsonResponse({ ok: false, error: 'Name is required (max 100 characters).' }, 400);
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ ok: false, error: 'A valid email address is required.' }, 400);
  }
  if (subject.length > 200) {
    return jsonResponse({ ok: false, error: 'Subject must be 200 characters or fewer.' }, 400);
  }
  if (!message || message.length > 5000) {
    return jsonResponse({ ok: false, error: 'Message is required (max 5,000 characters).' }, 400);
  }
  if (ref.length > 100) {
    return jsonResponse({ ok: false, error: 'Invalid product reference.' }, 400);
  }

  const data: InquiryData = { name, email, subject, message, ref };

  // Send admin notification (required — failure = error to client)
  try {
    await sendAdminNotification(data, env);
  } catch (err) {
    console.error('Admin notification failed:', err);
    return jsonResponse(
      { ok: false, error: 'Unable to send your message right now. Please try again shortly.' },
      502,
    );
  }

  // Send auto-reply (best-effort — don't block the response)
  ctx.waitUntil(
    sendAutoReply(data, env).catch((err) => {
      console.error('Auto-reply failed:', err);
    }),
  );

  return jsonResponse({ ok: true }, 200);
}

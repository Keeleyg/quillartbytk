import type { Env } from './index';
import { sendOrderNotification, sendOrderConfirmation } from './email';
import { reserveOrder } from './reservations';

export interface OrderItem {
  id: string;
  title: string;
  price: number | null;
}

export interface OrderData {
  customer: { name: string; email: string; phone: string };
  shipping: {
    line1: string;
    line2: string;
    suburb: string;
    state: string;
    postcode: string;
    country: string;
  };
  items: OrderItem[];
  notes: string;
  subtotal: number;
  /** Short reference shared with Tracey + the reservation record. */
  ref?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORS = { 'Access-Control-Allow-Origin': 'https://quillartbytk.com' };

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function handleOrder(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Could not read your order.' }, 400);
  }
  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ ok: false, error: 'Invalid order.' }, 400);
  }

  // Honeypot: silently succeed for bots
  if (typeof payload.company === 'string' && payload.company.trim().length > 0) {
    return jsonResponse({ ok: true }, 200);
  }

  const c = payload.customer ?? {};
  const s = payload.shipping ?? {};

  const name = str(c.name, 100);
  const email = str(c.email, 254);
  const phone = str(c.phone, 40);
  if (!name) return jsonResponse({ ok: false, error: 'Your name is required.' }, 400);
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse({ ok: false, error: 'A valid email address is required.' }, 400);
  }

  const line1 = str(s.line1, 200);
  const line2 = str(s.line2, 200);
  const suburb = str(s.suburb, 120);
  const state = str(s.state, 60);
  const postcode = str(s.postcode, 20);
  const country = str(s.country, 80) || 'Australia';
  if (!line1 || !suburb || !state || !postcode) {
    return jsonResponse({ ok: false, error: 'A complete shipping address is required.' }, 400);
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) {
    return jsonResponse({ ok: false, error: 'Your cart is empty.' }, 400);
  }
  if (rawItems.length > 50) {
    return jsonResponse({ ok: false, error: 'Too many items in one order.' }, 400);
  }
  const items: OrderItem[] = rawItems.map((it: any) => ({
    id: str(it?.id, 40),
    title: str(it?.title, 200) || 'Untitled piece',
    price:
      typeof it?.price === 'number' && isFinite(it.price) && it.price >= 0 ? it.price : null,
  }));
  const subtotal = items.reduce((sum, it) => sum + (it.price ?? 0), 0);
  const notes = str(payload.notes, 2000);

  const ref = crypto.randomUUID().slice(0, 8);
  const data: OrderData = {
    customer: { name, email, phone },
    shipping: { line1, line2, suburb, state, postcode, country },
    items,
    notes,
    subtotal,
    ref,
  };

  // Reserve the pieces BEFORE emailing. If another buyer just claimed any of
  // them, stop here and tell the customer which ones are gone.
  const reservation = await reserveOrder(env, {
    ref,
    name,
    email,
    placedAt: new Date().toISOString(),
    items,
  });
  if (!reservation.ok) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Sorry — one or more of your pieces was just reserved by another buyer and is no longer available.',
        reserved: reservation.reserved,
      },
      409,
    );
  }

  // Notify Tracey (required — failure is reported to the customer)
  try {
    await sendOrderNotification(data, env);
  } catch (err) {
    console.error('Order notification failed:', err);
    return jsonResponse(
      { ok: false, error: 'Unable to place your order right now. Please try again shortly.' },
      502,
    );
  }

  // Confirm to the customer (best-effort)
  ctx.waitUntil(
    sendOrderConfirmation(data, env).catch((err) => {
      console.error('Order confirmation failed:', err);
    }),
  );

  return jsonResponse({ ok: true }, 200);
}

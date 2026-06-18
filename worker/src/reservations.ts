import type { Env } from './index';

/* ------------------------------------------------------------------ *
 * Item reservations (the "seat map")                                  *
 *                                                                     *
 * Each piece is one-of-a-kind, so once a buyer clicks "Place order"   *
 * the items are held in Cloudflare KV and disappear from sale for     *
 * everyone else. There is NO automatic timeout — Tracey releases a    *
 * hold manually from the admin tool (buyer didn't pay) or the item    *
 * is marked Sold in the gallery editor (buyer paid).                  *
 *                                                                     *
 * KV layout:                                                          *
 *   'index'        -> JSON string[] of reserved item ids (fast read   *
 *                     for storefront badges + conflict checks)        *
 *   'order:<ref>'  -> JSON OrderRecord (detail for Tracey's admin)    *
 *                                                                     *
 * Only name/email/items are stored here so Tracey can identify a      *
 * hold — never the shipping address (that lives only in the email).   *
 * ------------------------------------------------------------------ */

export interface OrderRecord {
  ref: string;
  name: string;
  email: string;
  placedAt: string;
  items: { id: string; title: string; price: number | null }[];
}

const INDEX_KEY = 'index';
const CORS = { 'Access-Control-Allow-Origin': 'https://quillartbytk.com' };

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

async function getIndex(env: Env): Promise<string[]> {
  const raw = await env.RESERVATIONS.get(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function setIndex(env: Env, ids: string[]): Promise<void> {
  await env.RESERVATIONS.put(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

/** Reserve every item in an order, but only if none are already held. */
export async function reserveOrder(
  env: Env,
  order: OrderRecord,
): Promise<{ ok: true } | { ok: false; reserved: string[] }> {
  const index = await getIndex(env);
  const held = new Set(index);
  const wanted = order.items.map((i) => i.id).filter(Boolean);
  const conflicts = wanted.filter((id) => held.has(id));
  if (conflicts.length) return { ok: false, reserved: conflicts };

  await setIndex(env, index.concat(wanted));
  await env.RESERVATIONS.put(`order:${order.ref}`, JSON.stringify(order));
  return { ok: true };
}

/** Public: list of currently-reserved item ids (storefront badges). */
export async function handlePublicReservations(env: Env): Promise<Response> {
  const ids = await getIndex(env);
  return json({ ids }, 200, { ...CORS, 'Cache-Control': 'no-store' });
}

function authed(request: Request, env: Env): boolean {
  const token = request.headers.get('X-Admin-Token');
  return Boolean(env.ADMIN_TOKEN) && token === env.ADMIN_TOKEN;
}

/** Admin: list pending holds with customer + item detail. */
export async function handleAdminOrders(request: Request, env: Env): Promise<Response> {
  if (!authed(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);

  const listing = await env.RESERVATIONS.list({ prefix: 'order:' });
  const orders: OrderRecord[] = [];
  for (const key of listing.keys) {
    const raw = await env.RESERVATIONS.get(key.name);
    if (!raw) continue;
    try {
      orders.push(JSON.parse(raw) as OrderRecord);
    } catch {
      /* skip malformed */
    }
  }
  orders.sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1)); // newest first
  return json({ ok: true, orders });
}

/** Admin: release a whole order's items back to sale. */
export async function handleAdminRelease(request: Request, env: Env): Promise<Response> {
  if (!authed(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Bad request' }, 400);
  }
  const ref = typeof body?.ref === 'string' ? body.ref : '';
  if (!ref) return json({ ok: false, error: 'Missing order ref' }, 400);

  const raw = await env.RESERVATIONS.get(`order:${ref}`);
  if (!raw) return json({ ok: false, error: 'Order not found (already released?)' }, 404);

  let order: OrderRecord;
  try {
    order = JSON.parse(raw) as OrderRecord;
  } catch {
    order = { ref, name: '', email: '', placedAt: '', items: [] };
  }
  const releaseIds = new Set((order.items || []).map((i) => i.id).filter(Boolean));
  const index = await getIndex(env);
  await setIndex(env, index.filter((id) => !releaseIds.has(id)));
  await env.RESERVATIONS.delete(`order:${ref}`);

  return json({ ok: true, released: Array.from(releaseIds) });
}

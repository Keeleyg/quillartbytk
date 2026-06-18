import { handleInquiry } from './inquiry';
import { handleOrder } from './order';
import {
  handlePublicReservations,
  handleAdminOrders,
  handleAdminRelease,
} from './reservations';

export interface Env {
  RESEND_API_KEY: string;
  /** KV namespace holding the item "seat map" (reservations). */
  RESERVATIONS: KVNamespace;
  /** Shared secret the local admin tool sends to manage holds. */
  ADMIN_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for the form POST
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://quillartbytk.com',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/api/inquiry' && request.method === 'POST') {
      return handleInquiry(request, env, ctx);
    }

    if (url.pathname === '/api/order' && request.method === 'POST') {
      return handleOrder(request, env, ctx);
    }

    // Storefront: which item ids are currently reserved
    if (url.pathname === '/api/reservations' && request.method === 'GET') {
      return handlePublicReservations(env);
    }

    // Admin (token-protected): view + release holds
    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return handleAdminOrders(request, env);
    }
    if (url.pathname === '/api/admin/release' && request.method === 'POST') {
      return handleAdminRelease(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

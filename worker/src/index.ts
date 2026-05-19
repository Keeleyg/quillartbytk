export interface Env {
  // Phase 3 will populate (email service binding, etc.)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/inquiry' && request.method === 'POST') {
      // Phase 3 wires real handling. Stub returns success for visual testing.
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  },
};

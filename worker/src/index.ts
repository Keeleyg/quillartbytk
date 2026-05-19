import { handleInquiry } from './inquiry';

export interface Env {
  RESEND_API_KEY: string;
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

    return new Response('Not found', { status: 404 });
  },
};

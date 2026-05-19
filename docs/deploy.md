# Deploy

## Site (GitHub Pages)
Auto-deploys via `.github/workflows/deploy.yml` on every push to `main`.

Repo settings → Pages → Source: **GitHub Actions** (not "Deploy from a branch").
Custom domain: quillartbytk.com (managed in `public/CNAME` + Cloudflare DNS).

## Worker (Cloudflare)
Manual deploy from `worker/`:

```bash
cd worker
npx wrangler login        # first time only
npx wrangler deploy
```

The Worker is bound to `quillartbytk.com/api/*` via the route in `worker/wrangler.toml`.

## DNS setup (one-time, in Cloudflare dashboard)
- `quillartbytk.com` → CNAME to `<github-username>.github.io` (apex flattening handles it)
- Proxy: **on** (orange cloud) — required for the Worker route to fire
- SSL/TLS mode: **Full** (GitHub Pages serves HTTPS to the origin)

## Local development
- `npm run dev` — Astro site only. Form will 404 against the Worker.
- `cd worker && npm run dev` — Worker only at localhost:8787. Won't intercept `/api/*` from the Astro dev server.
- Phase 3 may add a proxy setup for fully-integrated local dev.

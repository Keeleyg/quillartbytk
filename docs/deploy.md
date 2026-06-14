# Deploy

## Site (GitHub Pages)
Auto-deploys via `.github/workflows/deploy.yml` on every push to `main`.

Repo settings → Pages → Source: **GitHub Actions** (not "Deploy from a branch").
Live URL: `https://quillartbytk.com` (apex custom domain via Cloudflare DNS).
The custom domain is kept across deploys by `public/CNAME` (emitted as `dist/CNAME`).
Served from the site root — no `base` is set in `astro.config.mjs`; `site` is the apex.

## Worker (Cloudflare)
Manual deploy from `worker/`:

```bash
cd worker
npx wrangler login        # first time only
npx wrangler deploy
```

The Worker is bound to `quillartbytk.com/api/*` via the route in `worker/wrangler.toml`.

### Viewing Worker logs

```bash
cd worker
npx wrangler tail
```

Shows real-time console output from production. Useful for debugging email send failures.

## Resend (email provider)

The inquiry form backend sends emails via [Resend](https://resend.com). Free tier: 100 emails/day, 3,000/month.

- **Account**: signed up under Tracey's email
- **API key**: stored as a Cloudflare Worker secret (never in the repo)
- **Sending address**: `inquiries@quillartbytk.com` (virtual, Resend handles delivery)
- **Destination**: `quillartbytk@gmail.com` (Tracey's inbox)
- **DNS records**: SPF, DKIM, and DMARC records on `quillartbytk.com` in Cloudflare, required for Resend domain verification

### Rotating the Resend API key

If the key is compromised:

1. Create a new key in Resend dashboard → API Keys
2. Set the new secret: `cd worker && npx wrangler secret put RESEND_API_KEY`
3. Update `worker/.dev.vars` with the new key for local dev
4. Delete the old key in Resend dashboard

## DNS setup (one-time, in Cloudflare dashboard)

### Site
- `quillartbytk.com` → CNAME to `<github-username>.github.io` (apex flattening handles it)
- Proxy: **on** (orange cloud) — required for the Worker route to fire
- SSL/TLS mode: **Full** (GitHub Pages serves HTTPS to the origin)

### Email (Resend)
All email DNS records must be **DNS only** (grey cloud):
- MX at `send.quillartbytk.com` → Resend's SES endpoint
- TXT at `send.quillartbytk.com` → SPF record
- TXT at `resend._domainkey.quillartbytk.com` → DKIM public key
- TXT at `_dmarc.quillartbytk.com` → DMARC policy

### Email routing (optional)
Cloudflare Email Routing forwards `inquiries@quillartbytk.com` → `quillartbytk@gmail.com`
(catches direct replies to the sending address).

## Local development
- `npm run dev` — Astro site only. Form will error against a missing Worker endpoint.
- `cd worker && npm run dev` — Worker only at localhost:8787 (reads `.dev.vars` for secrets).
- The two servers run independently; the form POST from the Astro dev server won't reach the Worker dev server without a proxy.

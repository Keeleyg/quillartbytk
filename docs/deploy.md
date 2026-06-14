# Deploy

## Site (GitHub Pages)
Auto-deploys via `.github/workflows/deploy.yml` on every push to `main`.

Repo settings → Pages → Source: **GitHub Actions** (not "Deploy from a branch").
Live URL: `https://quillartbytk.com` (apex custom domain via Cloudflare DNS).
The custom domain is kept across deploys by `public/CNAME` (emitted as `dist/CNAME`).
Served from the site root — no `base` is set in `astro.config.mjs`; `site` is the apex.

## Worker (Cloudflare) — inquiry form backend

The contact form posts same-origin to `/api/inquiry`. A Cloudflare Worker
(`worker/`, entry `worker/src/index.ts`) answers `/api/*` on the domain and
sends the emails via Resend. It is deployed **manually with wrangler**, separate
from the Pages deploy — pushing to `main` does **not** deploy the Worker.

**Routes** (bound automatically on deploy, from `worker/wrangler.toml`):
- `quillartbytk.com/api/*`
- `www.quillartbytk.com/api/*`

The only secret is **`RESEND_API_KEY`** (read as `env.RESEND_API_KEY`; never in
the repo).

### First deploy (one-time)

Prerequisites: the Cloudflare proxy is **on** (orange cloud) on the apex DNS
record, and the Resend domain is **verified** (see Resend section) — otherwise
the Worker deploys fine but every send fails with a 502.

```bash
cd worker
npx wrangler login                      # opens a browser to authorise
npx wrangler secret put RESEND_API_KEY  # paste the Resend API key when prompted
npx wrangler deploy                     # builds, deploys, binds both routes
```

If your Cloudflare login has more than one account, wrangler will ask which to
use — set `CLOUDFLARE_ACCOUNT_ID`, or uncomment + fill `account_id` in
`worker/wrangler.toml`.

### Subsequent deploys

```bash
cd worker
npx wrangler deploy
```

### Verify

- Open `https://quillartbytk.com/api/inquiry` — a GET returns a plain
  `Not found` (the Worker's 404), which confirms the route is bound. Before the
  Worker is deployed this returns the GitHub Pages 404 page instead.
- Submit the form at `https://quillartbytk.com/contact` — you get the success
  message, an email arrives at `tracey@quillartbytk.com`, and the sender
  receives an auto-reply.

### Viewing Worker logs

```bash
cd worker
npx wrangler tail
```

Real-time console output from production. Useful for debugging email failures.

## Resend (email provider)

The inquiry form backend sends emails via [Resend](https://resend.com). Free tier: 100 emails/day, 3,000/month.

- **Account**: signed up under Tracey's email
- **API key**: stored as a Cloudflare Worker secret (never in the repo)
- **Sending address (From)**: `inquiries@quillartbytk.com` (virtual, Resend handles delivery)
- **Destination (To)**: `tracey@quillartbytk.com` → forwarded to the gmail inbox via Cloudflare Email Routing
- **DNS records**: SPF, DKIM, and DMARC records on `quillartbytk.com` in Cloudflare, required for Resend domain verification — the From domain won't send until these verify green

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

### Email routing
Cloudflare Email Routing forwards domain mailboxes to the gmail inbox:
- `tracey@quillartbytk.com` → gmail (where inquiry notifications land)
- `inquiries@quillartbytk.com` → gmail (catches direct replies to the From address)

## Local development
- `npm run dev` — Astro site only. Form will error against a missing Worker endpoint.
- `cd worker && npm run dev` — Worker only at localhost:8787 (reads `.dev.vars` for secrets).
- The two servers run independently; the form POST from the Astro dev server won't reach the Worker dev server without a proxy.

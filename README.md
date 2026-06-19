# Quillart by TK — quillartbytk.com

Product‑catalogue, store, and commission website for **[quillartbytk.com](https://quillartbytk.com)** — handmade quilled paper art by Tracey ("TK"). Built with **Astro** (static output), deployed to **GitHub Pages** on the apex domain via **Cloudflare**, with a small **Cloudflare Worker** API for the contact form, store orders, and item reservations, plus a **local‑only admin tool** for editing the catalogue.

> **Spelling:** the brand is **Quillart** — one word, no space. Always "Quillart by TK", never "Quill Art".

---

## Contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Content model](#content-model)
  - [Products](#products)
  - [Collections](#collections)
  - [Events](#events)
  - [Images](#images)
- [Pages & site map](#pages--site-map)
- [Store, cart & checkout](#store-cart--checkout)
- [Item reservations (the "seat map")](#item-reservations-the-seat-map)
- [Cloudflare Worker API](#cloudflare-worker-api)
- [Admin tool (gallery editor)](#admin-tool-gallery-editor)
- [Zeller POS Lite sync](#zeller-pos-lite-sync)
- [Deployment](#deployment)
- [Cloudflare & Resend configuration](#cloudflare--resend-configuration)
- [Operational runbook](#operational-runbook)

---

## Architecture at a glance

Three independent parts:

| Part | What it is | Where it runs |
|------|-----------|---------------|
| **Static site** | Astro builds `src/` into static HTML/CSS/JS | GitHub Pages → `quillartbytk.com` |
| **Worker API** | Cloudflare Worker handling `/api/*` (contact, orders, reservations) | Cloudflare edge, routed on `quillartbytk.com/api/*` |
| **Admin tool** | Local Express app to edit the catalogue + manage holds | Tracey's / the owner's laptop only (`localhost:4399`) |

The site itself is **100% static** — there is no server rendering. Anything dynamic (sending an email, placing an order, holding an item) is a client‑side `fetch` to the Worker.

```
Visitor ──HTML──▶ GitHub Pages (static site)
   │
   └──fetch /api/*──▶ Cloudflare Worker ──▶ Resend (email) + KV (reservations)

Owner ──▶ Admin tool (localhost) ──git──▶ GitHub (main) ──▶ Pages rebuild
                     └──HTTPS /api/admin/*──▶ Worker (view/release holds)
```

---

## Tech stack

- **[Astro](https://astro.build) ^6.3.5**, `output: 'static'`.
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate config file; utility classes in components).
- **Astro content collections** (`glob` loader) with **Zod** schema validation — see [`src/content.config.ts`](src/content.config.ts).
- **`@astrojs/sitemap`** integration; a custom `copyImages` integration and `imageServer` dev plugin live in [`astro.config.mjs`](astro.config.mjs).
- **Cloudflare Workers** (TypeScript) + **Workers KV** + **[Resend](https://resend.com)** for email — see [`worker/`](worker/).
- **Express 5** for the local admin tool — see [`admin/`](admin/).
- Fonts: Inter + Fraunces (variable, self‑hosted via `@fontsource-variable`).

No client framework — interactivity is small vanilla‑JS `<script>` blocks and [`public/cart.js`](public/cart.js).

---

## Repository layout

```
quillartbytk/
├── astro.config.mjs          Astro config (site, integrations, image copy/serve)
├── package.json              Scripts: dev / build / preview / admin / admin:setup
├── src/
│   ├── content.config.ts     Zod schema for products + collections (source of truth)
│   ├── content/
│   │   ├── products/*.md      One markdown file per piece (frontmatter = data)
│   │   └── collections/<slug>/index.md   Curated collections (+ their images)
│   ├── data/events.json      Markets & events
│   ├── layouts/Base.astro    HTML shell (head, header, footer, cart.js)
│   ├── components/           Header, Footer, ProductCard, ProductGrid, FilterNav,
│   │                         AddToCart, Lightbox, SEO, …
│   ├── lib/
│   │   ├── products.ts       Visibility / availability / price helpers
│   │   └── images.ts         url() base helper, image path resolution, labels
│   └── pages/                Routes (see “Pages & site map”)
├── public/
│   ├── cart.js               Client cart + reservation logic (loaded site‑wide)
│   ├── CNAME                 quillartbytk.com (keeps the custom domain on deploy)
│   ├── logo.jpg, favicon.svg, robots.txt
├── images/
│   └── P###/                 Per‑product image folders (main.jpg, angle‑*.jpg, …)
├── worker/                   Cloudflare Worker (the /api/* backend)
│   ├── src/{index,inquiry,order,reservations,email}.ts
│   └── wrangler.toml         Routes, KV binding
├── admin/                    Local‑only gallery editor (NOT deployed)
│   ├── server.mjs            Express server + git draft/publish workflow
│   ├── setup.mjs             One‑time credential setup (npm run admin:setup)
│   ├── public/               Admin UI (index.html, app.js, styles.css)
│   └── credentials.json      Login + worker token (GITIGNORED — never committed)
├── docs/                     Deploy notes + Tracey's setup/user guide (DOCX)
└── .github/workflows/deploy.yml   GitHub Pages build & deploy
```

---

## Local development

```bash
npm install            # install site deps
npm run dev            # Astro dev server (hot reload) → http://localhost:4321
npm run build          # static build into dist/
npm run preview        # serve the built dist/ locally
```

The Worker (`/api/*`) is **not** available under `npm run dev` — the contact form, checkout, and reservation badges only work against the deployed Worker on `quillartbytk.com`. To work on the Worker locally, use `cd worker && npx wrangler dev`.

---

## Content model

All catalogue data lives in version control as markdown/JSON. Editing is normally done through the [admin tool](#admin-tool-gallery-editor), but the files are plain text and can be hand‑edited.

### Products

One markdown file per piece in `src/content/products/<slug>.md`. The **frontmatter is the data**; the markdown **body is the description**. Schema (validated at build time by [`src/content.config.ts`](src/content.config.ts)):

```markdown
---
id: P037                     # required, format P### (3+ digits; P001–P999 then P1000…) — stable catalogue id / SKU
title: Heidi Name Frame
category: framed             # framed | clocks | canvas | cards | homewares
themes: [names, nursery]    # one or more (see theme list below)
status: available           # available | order | sold   (default: available)
hidden: false               # true = removed from the whole site
featured: false             # true = eligible for the home‑page Featured row
price: 50                   # number or null
sale_price: null            # number or null — when set (and available), shows a Sale
lead_time: null             # e.g. "2–3 weeks" (mainly for made‑to‑order)
collection: null            # slug of a parent collection, or null
palette_variants: []        # optional list of colourway names
frame_options: []           # optional list of frame choices
images:
  main: P037/main.jpg       # required hero image (path under images/)
  angles: [P037/angle-1.jpg]
  process: [P037/wip-1.jpg] # making‑of shots (lightbox “how it’s made” only)
# Card‑only fields (ignored unless category: cards):
# card_occasion, card_size, card_envelope_colour,
# card_blank_inside, card_includes_envelope, card_customisable
---

Markdown description of the piece shown on its product page.
```

**Status & visibility** (logic in [`src/lib/products.ts`](src/lib/products.ts)):

| Status | On the Store? | On the Gallery? | Price shown | Buyable |
|--------|:---:|:---:|---|:---:|
| `available` | ✅ (if not hidden) | ✅ | `$X` (or strikethrough + sale price) | ✅ Add to cart |
| `order` | ❌ | ✅ | "Made to order" | ❌ (Inquire) |
| `sold` | ❌ | ✅ | "Sold" | ❌ (Inquire about similar) |

- **`hidden: true`** removes a piece from the *entire* site (no Store, no Gallery, no product page). This is the only true visibility gate — sold pieces deliberately stay on display as a portfolio.
- **Sale:** when a piece is `available` *and* has both `price` and `sale_price`, it shows a yellow **"Sale"** sticker, the original price struck through, and the sale price in bold. The cart uses the sale price.
- **`featured: true`** makes a visible piece eligible for the home‑page Featured row.

**Categories** (what the piece *is*): `framed`, `clocks`, `canvas`, `cards`, `homewares`.

**Themes** (what it *depicts*): `trees`, `misc`, `nursery`, `birds`, `flowers`, `insects`, `animals`, `nautical`, `names`, `seasonal`, `australiana`, `pets`.

> To add a category or theme, edit the `VALID_CATEGORIES` / `VALID_THEMES` arrays in `src/content.config.ts` **and** mirror them in `admin/server.mjs`.

### Collections

Curated groupings live in `src/content/collections/<slug>/index.md` with their own hero/gallery images in the same folder. Frontmatter: `slug`, `title`, `description`, `members` (product ids), `hero`, `gallery`, `themes`, `order`.

### Events

Markets and fairs live in `src/data/events.json` (array). Each: `id`, `name`, `date` (`YYYY-MM-DD` start date), `endDate` (optional `YYYY-MM-DD` — set it for **multi‑day** events; blank = single day), `venue`, `stallNumber`, `url`, `status` (`confirmed`/`tentative`/`cancelled`), `hidden`, `description`. Edited via the admin **Events** tab. A multi‑day event stays in "Upcoming" until its `endDate` has passed; otherwise events move to "past" automatically.

### Images

- Product images live in **`images/P###/`** (e.g. `images/P037/main.jpg`) and are referenced by frontmatter paths relative to `images/`.
- At build time the custom `copyImages` integration copies `images/P*/` into `dist/images/`, and collection images into `dist/collections/`. During `npm run dev`, the `imageServer` Vite plugin serves them from disk.
- Site chrome images (`logo.jpg`, `favicon.svg`, `robots.txt`, `CNAME`, `cart.js`) live in **`public/`** and are copied verbatim.

---

## Pages & site map

| Route | Purpose |
|-------|---------|
| `/` | Home — hero, "Shop now", Featured pieces, how‑it's‑made |
| `/store`, `/store/category/<c>`, `/store/theme/<t>` | **Buyable** pieces only (`available`), with Add to cart |
| `/gallery`, `/gallery/category/<c>`, `/gallery/theme/<t>` | Full portfolio (all visible pieces) |
| `/products/<slug>` | Product detail — images, lightbox, price, Add to cart / Inquire |
| `/collections`, `/collections/<slug>` | Curated collections |
| `/commissions` | Bespoke commission information |
| `/events` | Markets & fairs |
| `/about`, `/contact` | About the artist; contact form (→ `/api/inquiry`) |
| `/cart`, `/checkout` | Shopping cart and order form |
| `/404` | Custom not‑found |

---

## Store, cart & checkout

The Store sells one‑of‑a‑kind pieces. Because Zeller has **no hosted online checkout yet**, payment is handled with a **manual Zeller payment‑link flow** that stores **no card or address data on the site**:

1. **Cart** — client‑side only ([`public/cart.js`](public/cart.js), `localStorage`). Each piece is unique, so quantity is always 1 and an item can't be added twice. A header badge shows the count.
2. **Checkout** (`/checkout`) — collects contact details + AU shipping address, then `POST`s JSON to **`/api/order`**.
3. The Worker emails **Tracey** the order (items, subtotal, address, order ref) and emails the **customer** a confirmation explaining a secure payment link is on the way. Subtotals **exclude postage** — Tracey sets the final total.
4. Tracey sends a **Zeller Payment Link / Invoice** for the order + postage. When paid, she marks the piece **Sold** in the admin tool (removing it from the Store).

No payment is ever taken on the site; no card details are collected anywhere.

> **Why manual:** Zeller's e‑commerce checkout and Payment‑Links API are "coming soon" with no date. When they ship, only the final "send link" step changes — the cart, checkout, and order capture are reusable. See `docs/` and the project memory for the decision record.

---

## Item reservations (the "seat map")

To stop two buyers purchasing the same unique piece, items are **locked the moment a buyer clicks "Place order"** — airline‑seat style. Holds are released **manually** by Tracey (there is intentionally **no automatic timeout**).

**How it works:**

- State lives in **Cloudflare KV** (namespace binding `RESERVATIONS`):
  - `index` → JSON array of reserved item ids (drives storefront badges).
  - `order:<ref>` → one record per hold: `{ ref, name, email, placedAt, items }`. Only name/email/items are stored — **never the address** (that's in the email only).
- **`POST /api/order`** reserves all items *before* emailing. If another buyer just claimed any, it returns **409** with the conflicting ids and sends no email; the checkout drops those items and asks the buyer to review.
- **`GET /api/reservations`** returns the reserved ids; `cart.js` fetches it on every page and shows a **"Reserved"** badge with a disabled Add‑to‑cart on those pieces.
- The admin **Orders** tab lists active holds and offers **Release back to sale** per order.

Release a hold when a buyer hasn't paid (puts the piece back on sale) or after you've marked the piece Sold in the Gallery.

---

## Cloudflare Worker API

Lives in [`worker/`](worker/), deployed with Wrangler. Routed on `quillartbytk.com/api/*` and `www.quillartbytk.com/api/*` (see `worker/wrangler.toml`).

| Method & path | Auth | Purpose |
|---------------|------|---------|
| `POST /api/inquiry` | — | Contact‑form submission → emails Tracey + auto‑reply |
| `POST /api/order` | — | Place a store order → reserve items + email order/confirmation |
| `GET /api/reservations` | — | List reserved item ids (storefront badges) |
| `GET /api/admin/orders` | `X-Admin-Token` | List active holds (for the admin tool) |
| `POST /api/admin/release` | `X-Admin-Token` | Release a hold back to sale |

**Bindings & secrets** (not in the repo):

- **KV namespace** `RESERVATIONS` — id is committed in `wrangler.toml` (not secret). Create with `npx wrangler kv namespace create RESERVATIONS`.
- **`RESEND_API_KEY`** secret — for sending email via Resend.
- **`ADMIN_TOKEN`** secret — shared secret the admin tool sends as `X-Admin-Token`. Set with `npx wrangler secret put ADMIN_TOKEN`; it **must equal** `workerAdminToken` in each `admin/credentials.json`.

**Email:** all mail is sent from and to **`tracey@quillartbytk.com`** (the only real mailbox; forwards to the gmail inbox). Notifications set `reply_to` to the customer; auto‑replies set `reply_to` to Tracey.

**Deploy the Worker:**

```bash
cd worker
npm install
npx wrangler deploy
```

---

## Admin tool (gallery editor)

A **local‑only** Express app for editing the catalogue without touching markdown by hand. It never runs in production — it edits files on disk and pushes to GitHub.

```bash
npm run admin:setup     # once per machine — creates admin/credentials.json (login)
npm run admin           # starts the editor → http://localhost:4399/admin-tool/
```

**Draft → publish workflow.** Edits accumulate on a local `gallery-edits` branch so nothing goes live until you choose to publish:

- **Editing** writes + commits to the `gallery-edits` draft branch.
- **Build preview** runs `astro build` and serves `dist/` at the root for review.
- **Commit (publish)** squash‑merges `gallery-edits` → `main` and pushes (triggering the Pages deploy). Publish is self‑healing (fetches origin and resyncs before merging).
- **Discard** deletes the draft branch.
- **Sync from live** fast‑forwards this computer's `main` to `origin/main` (pulling in changes published from another machine). The button is **greyed out unless `origin/main` is ahead**, shows the count when there is ("Sync from live (N new)"), polls every 2 min, and refuses while there are unpublished edits (publish or discard first). Each machine has its own clone, so after one machine publishes, the others Sync to catch up.

**Three tabs:**

- **Gallery** — edit every product attribute (title, category, themes, status, price, sale price, lead time, featured, visibility, card‑specific fields); create new items; manage images (add, swap an angle to main, move an angle to another item, drag‑reorder, and "delete" which *moves* the file to the `images/` root rather than erasing it); sidebar search + filters (category / theme / status / visibility).
- **Events** — add/edit markets and fairs.
- **Orders** — view active checkout holds (ref, time, customer, items) and **Release back to sale**. Requires `workerAdminToken` (below).

**Credentials & the Worker token.** `admin/credentials.json` is **gitignored** and holds the login hash plus a `workerAdminToken`. The token must match the Worker's `ADMIN_TOKEN` secret, and **each machine** that runs the admin tool needs the same `workerAdminToken` line, or the Orders tab shows a "not connected" hint. Concurrent editing on two machines is fine for *different* items; the same item can conflict (publish resyncs to resolve cleanly).

---

## Zeller POS Lite sync

Tracey sells in person at markets using **Zeller POS Lite**, which has no catalogue API — it's populated by CSV import. The admin tool's **"⬇ Zeller POS CSV"** button (top bar) downloads `zeller-pos-items.csv` of the pieces currently for sale (status `available`, not hidden). Import it via the Zeller Dashboard → **All Items → Manage → Import Items**. Export *after* publishing so it mirrors the live Store.

The file matches Zeller's `catalogue-items-template.csv` **exactly** (16 columns), so every column auto‑maps on import. Per‑item mapping:

| Zeller column | Value |
|---------------|-------|
| `Item Name` / `Description (Optional)` | Product title / first line of the description |
| `Category` | Capitalised category (e.g. `Framed`) |
| `Price` | **Live selling price** — the sale price when on sale, otherwise the standard price |
| `SKU (Optional)` | The product `id` (e.g. `P037`) |
| `GST Applicable (Y/N)` | `N` (assumes not GST‑registered — change in code if that changes) |
| `Enable for Invoices (Y/N)` / `Available` / `Site A` | `Y` (so items are selectable on Zeller Invoices / payment links) |

> "Site A" is the single‑site column from the downloaded template — rename it in `admin/server.mjs` if the Zeller account's site is named differently. Restart `npm run admin` after any export change, then re‑download before importing.

---

## Deployment

- **Site:** pushing to **`main`** triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — `npm ci`, `npm run build`, then deploy `dist/` to GitHub Pages (Node 22).
- **Custom domain:** `public/CNAME` contains `quillartbytk.com`, preserving the apex domain across deploys. There is **no `base` path** — the site serves from the domain root.
- **DNS/CDN:** Cloudflare proxies the apex (and `www`) to GitHub Pages, SSL mode **Full**, with the Worker routed on `/api/*`.
- **Worker:** deployed separately with `npx wrangler deploy` from `worker/` (see above). First‑deploy notes are in `docs/deploy.md`.

---

## Cloudflare & Resend configuration

The domain, the Worker, item‑reservation storage, and email all depend on a one‑time setup in **Cloudflare** and **Resend**. The full first‑deploy walkthrough is in [`docs/deploy.md`](docs/deploy.md); this is the reference for *what* must exist.

### Cloudflare

The `quillartbytk.com` zone is on Cloudflare, which provides DNS, the CDN/proxy, the Worker, KV storage, and inbound email forwarding.

**1. DNS — site.** The apex (and `www`) point to GitHub Pages and must be **proxied** (orange cloud) so the Worker route can intercept `/api/*`:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `@` (apex) | `<github-username>.github.io` (CNAME flattening) | **Proxied** 🟠 |
| CNAME | `www` | `<github-username>.github.io` | **Proxied** 🟠 |

- **SSL/TLS mode: Full** (GitHub Pages serves HTTPS to the origin).
- Enable **Always Use HTTPS**.
- The apex CNAME‑flattening approach is what's in use; the classic alternative is four `A` records to GitHub's Pages IPs (`185.199.108–111.153`). Either works — keep the proxy on.

**2. Worker.** Deployed manually with Wrangler from [`worker/`](worker/) (a push to `main` does **not** deploy it). Routes are bound automatically from `worker/wrangler.toml`:

- `quillartbytk.com/api/*`
- `www.quillartbytk.com/api/*`

If the Cloudflare login has multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` (or uncomment `account_id` in `wrangler.toml`).

```bash
cd worker
npx wrangler login            # one-time browser auth
npx wrangler deploy           # build + deploy + bind routes
npx wrangler tail             # live production logs (debugging)
```

**3. KV namespace (reservations).** The `RESERVATIONS` namespace stores the item "seat map". Create it once and put the returned id in `worker/wrangler.toml` under `[[kv_namespaces]]` (the id is **not** a secret):

```bash
cd worker
npx wrangler kv namespace create RESERVATIONS
```

**4. Worker secrets** (stored in Cloudflare, never in the repo):

| Secret | Used for | Set with |
|--------|----------|----------|
| `RESEND_API_KEY` | Sending email via Resend | `npx wrangler secret put RESEND_API_KEY` |
| `ADMIN_TOKEN` | Auth for `/api/admin/*` (must equal `workerAdminToken` in `admin/credentials.json`) | `npx wrangler secret put ADMIN_TOKEN` |

For local Worker dev (`cd worker && npx wrangler dev`), put the same values in **`worker/.dev.vars`** (gitignored).

**5. Email routing.** **Cloudflare Email Routing** forwards `tracey@quillartbytk.com` → the Gmail inbox. This is the only real mailbox on the domain; `inquiries@quillartbytk.com` does **not** exist and is never used.

**6. Web analytics (optional).** [`src/layouts/Base.astro`](src/layouts/Base.astro) includes a Cloudflare Web Analytics beacon that loads **only in production builds**. Replace the placeholder `REPLACE_WITH_YOUR_CF_ANALYTICS_TOKEN` with the real token from Cloudflare → **Analytics & Logs → Web Analytics**. Until then it's a harmless no‑op.

### Resend (email provider)

Outbound email (inquiry alerts, order notifications, auto‑replies, order confirmations) is sent via **[Resend](https://resend.com)**. Free tier: 100 emails/day, 3,000/month.

- **Account:** signed up under Tracey's email.
- **API key:** stored only as the Worker secret `RESEND_API_KEY` (above).
- **From / To:** everything uses **`tracey@quillartbytk.com`** — it must be on the Resend‑**verified** domain. Notifications set `reply_to` to the customer; auto‑replies set `reply_to` to Tracey.
- **Domain verification — DNS records** (added in Cloudflare, all **DNS‑only / grey cloud**). The From domain won't send until these verify green:

| Type | Name | Purpose |
|------|------|---------|
| MX | `send.quillartbytk.com` | Resend (SES) endpoint |
| TXT | `send.quillartbytk.com` | SPF |
| TXT | `resend._domainkey.quillartbytk.com` | DKIM public key |
| TXT | `_dmarc.quillartbytk.com` | DMARC policy |

> If a deployed Worker returns **502** on send, the usual cause is the Resend domain not being verified (or the apex proxy being off).

**Rotating the Resend key:** create a new key in Resend → API Keys; `cd worker && npx wrangler secret put RESEND_API_KEY`; update `worker/.dev.vars`; delete the old key.

---

## Operational runbook

| Task | How |
|------|-----|
| Add / edit a piece | Admin tool → Gallery (or hand‑edit `src/content/products/*.md`), then **Commit** |
| Put a piece on sale | Set `sale_price` (Gallery tab → Sale price field) on an `available` piece |
| Mark a piece sold | Set status → `sold`; publish. Then release its hold in **Orders** if one exists |
| Handle a store order | Order email arrives → send a Zeller payment link for total + postage → mark Sold |
| Free an unpaid hold | Admin **Orders** tab → **Release back to sale** |
| Update markets | Admin **Events** tab |
| Sync POS Lite | Admin top bar → **⬇ Zeller POS CSV** → import in Zeller |
| Change inquiry email | Edit `FROM` / `ADMIN_EMAIL` in `worker/src/email.ts`, redeploy the Worker |
| Rotate the admin token | `wrangler secret put ADMIN_TOKEN`, update `workerAdminToken` in every `admin/credentials.json` |

---

© Quillart by TK. Site code maintained in this repository.

# Quill Art by TK — Product Catalog

Static product catalog and commission portal for [quillartbytk.com](https://quillartbytk.com), hosted on GitHub Pages with a custom domain via Cloudflare DNS.

## Quick Start

1. Clone this repo
2. Open `index.html` in a browser (or use a local server like `npx serve`)
3. Edit `products.json` to add/update artworks
4. Commit and push — GitHub Pages deploys automatically

## How the site works

The gallery is primarily a **portfolio of commissionable styles**. Most items have `"status": "order"` — visitors can commission that style (as-is or with variations) via a mailto button. The rare in-stock piece has `"status": "available"` and gets a firm price with a "Purchase" button.

There's also a dedicated [commission page](commission.html) for fully bespoke briefs where the customer describes what they want from scratch.

All enquiries go through mailto links — no form backend, no payment integration. You create Zeller Invoices manually after discussing with the customer.

## Adding a New Artwork

1. **Add the image** to `images/` using the naming convention `piece-{id}.jpg` (see `images/README.md` for specs)
2. **Add an entry** to `products.json`:

```json
{
  "id": "004",
  "title": "Your Artwork Title",
  "description": "A detailed description of the piece.",
  "dimensions": "30cm x 40cm",
  "medium": "Quilled paper on canvas",
  "price": 250,
  "currency": "AUD",
  "status": "order",
  "leadTimeWeeks": 3,
  "image": "images/piece-004.jpg",
  "dateAdded": "2026-06-01"
}
```

3. **Commit and push** to deploy

### Status Values

| Status      | Default? | Card button              | Price display     | Effect                                  |
|-------------|----------|--------------------------|-------------------|-----------------------------------------|
| `order`     | **Yes**  | "Commission this style"  | "from $X AUD"    | Guide price, mailto with commission brief |
| `available` | Rare     | "Purchase"               | "$X AUD"          | Firm price, mailto requesting Zeller Invoice |
| `reserved`  | —        | (none)                   | "from $X AUD"    | "Currently reserved" shown              |
| `sold`      | —        | (none)                   | "$X AUD"          | "Sold" badge                            |

**`order` is the default.** Only set `available` when a piece is genuinely in stock and ready to ship.

### Optional: `priceIsFirm`

By default, `available` items have firm prices and everything else is a guide. To override this (rare), add `"priceIsFirm": true` or `"priceIsFirm": false` to a product entry. When absent, the value is derived from status.

### Optional: `leadTimeWeeks`

Per-item lead time for commission pieces. If omitted, falls back to `config.defaultLeadTimeWeeks` (currently 3 weeks). Only relevant for `order` status items.

## Site Configuration

Edit `config.js` to change:

| Field | What it controls |
|-------|-----------------|
| `siteTitle` | Site name in header |
| `tagline` | Subtitle below site name |
| `email` | All mailto enquiry links |
| `baseUrl` | Canonical URLs and JSON-LD |
| `social.facebook` | Footer Facebook link |
| `defaultLeadTimeWeeks` | Fallback lead time for gallery commissions (number, e.g. `3`) |
| `customCommissionLeadTime` | Lead time shown on the custom commission page and mailto (free-text string, e.g. `"4-8 weeks"`, `"currently 6+ weeks"`) |
| `deposit` | Deposit fraction mentioned on commission page (e.g. `0.5` = 50%) |
| `commission.introBlurb` | Intro paragraph on commission.html — edit this to change the commission page intro without touching HTML |
| `commission.leadTimeDisclaimer` | Disclaimer shown after the lead time on commission page |

### Lead time fields

- **`defaultLeadTimeWeeks`** (number): Used for `order`-status gallery items. Appears in the commission mailto body as "Lead time understood: ~X weeks."
- **`customCommissionLeadTime`** (string): Used on the commission page and in the custom commission mailto. This is a free-text string — you can write `"4-8 weeks"`, `"currently 6+ weeks — taking bookings for February"`, or whatever suits the current queue.

### Pricing note

- **"from $X AUD"** is shown for all non-available items. The word "from" signals the price is a guide.
- **"$X AUD"** (no "from") is shown for available/in-stock items. This is the firm, pay-this-now price.
- The commission page includes a note explaining that gallery prices are guides and in-stock pieces are the only firm prices.

## File Structure

```
├── index.html         Main gallery page
├── commission.html    Custom commission landing page
├── about.html         About the artist
├── 404.html           Custom error page
├── styles.css         All styles
├── script.js          Gallery, lightbox, filters, SEO
├── config.js          Site settings (edit for config)
├── products.json      Product data (edit regularly)
├── images/            Product photos
│   └── README.md      Image naming and specs
├── robots.txt         Search engine crawling rules
├── sitemap.xml        Static sitemap (/, /commission, /about)
├── favicon.svg        Monogram favicon
└── README.md          This file
```

## SEO

- Each product is deep-linkable via URL hash (e.g., `quillartbytk.com/#item=001`)
- JSON-LD structured data: site-wide `WebSite`, per-page `ItemList`, per-item `Product`, and `Service` on the commission page
- `order` items use `schema.org/MadeToOrder` availability and include a `priceSpecification` noting the price is a guide
- Open Graph and Twitter Card tags on all pages
- Products are indexed via JSON-LD on the index page rather than separate URLs

## Domain & Hosting

- **Hosting:** GitHub Pages (auto-deploys from the default branch)
- **Domain:** `quillartbytk.com` (add CNAME file when ready)
- **DNS:** Managed via Cloudflare — point A records to GitHub Pages IPs and CNAME `www` to `<username>.github.io`

### GitHub Pages DNS Setup (Cloudflare)

| Type  | Name  | Content              |
|-------|-------|----------------------|
| A     | @     | 185.199.108.153      |
| A     | @     | 185.199.109.153      |
| A     | @     | 185.199.110.153      |
| A     | @     | 185.199.111.153      |
| CNAME | www   | `<username>.github.io` |

Replace `<username>` with your GitHub username. Set Cloudflare SSL mode to **Full** and enable **Always Use HTTPS**.

## Enquiry Flow

1. **In-stock purchase:** Customer clicks "Purchase" → mailto opens with pre-filled Zeller Invoice request → you create invoice in Zeller
2. **Gallery commission:** Customer clicks "Commission this style" → mailto opens with variations brief → you discuss, quote, and invoice via Zeller
3. **Custom commission:** Customer fills out the brief on commission.html → mailto opens → you discuss, quote, and invoice via Zeller

All three flows use mailto links. If this ever starts losing enquiries, the upgrade path is a Cloudflare Worker + R2 form endpoint (out of scope for now).

## Tech Stack

Plain HTML, CSS, and vanilla JavaScript. No build step, no frameworks, no npm.

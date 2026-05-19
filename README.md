# Quillart by TK — Product Catalog

Static product catalog and commission portal for [quillartbytk.com](https://quillartbytk.com), hosted on GitHub Pages with a custom domain via Cloudflare DNS.

> **Spelling note:** The brand is **Quillart** (one word, no space) — not "Quill Art". Use "Quillart by TK" everywhere.

## Quick Start

1. Clone this repo
2. Open `index.html` in a browser (or use a local server like `npx serve`)
3. Edit `products.json` to add/update artworks
4. Edit `events.json` to manage upcoming markets and events
5. Commit and push — GitHub Pages deploys automatically

## How the site works

The gallery is primarily a **portfolio of commissionable styles**. Most items have `"status": "order"` — visitors can commission that style (as-is or with variations) via a mailto button. The rare in-stock piece has `"status": "available"` and gets a firm price with a "Purchase" button.

There's also a dedicated [commission page](commission.html) for fully bespoke briefs where the customer describes what they want from scratch, and an [events page](events.html) listing upcoming markets where customers can see pieces in person.

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

## Managing Events

Edit `events.json` to add, update, or mark events. The events page and the commission page's "Meet us in person" section both read from this file.

### Event schema

```json
{
  "id": "market-001",
  "name": "Sunrise Markets",
  "date": "2026-07-12",
  "venue": "Main Street Hall, Springfield",
  "stallNumber": "Stall 14",
  "url": "https://example.com/sunrise-markets",
  "status": "confirmed",
  "description": "Come see the full range in person."
}
```

| Field         | Required | Notes |
|---------------|----------|-------|
| `id`          | Yes      | Unique ID. Used for deep-link anchors (`events.html#event-{id}`) |
| `name`        | Yes      | Event / market name |
| `date`        | Yes      | `YYYY-MM-DD` format. Used to sort and split upcoming vs past |
| `venue`       | Yes      | Location description |
| `stallNumber` | No       | Stall or site number if known |
| `url`         | No       | External link to the event's own page |
| `status`      | Yes      | `confirmed`, `tentative`, or `cancelled` |
| `description` | No       | Short description shown on the event card |

### Event statuses

- **`confirmed`** — shows normally
- **`tentative`** — shows with a "Date to be confirmed" badge
- **`cancelled`** — shows greyed out with a "Cancelled" badge; excluded from the commission page markets list

### Where events appear

- **events.html** — all events, split into upcoming and past sections
- **commission.html** — "Meet us in person" section shows up to 3 upcoming non-cancelled events. Section hides automatically when there are none.

### Past events

Events with dates before today automatically move to the "Past events" section on the events page. No manual cleanup needed — just leave old entries in the file as a record.

## Site Configuration

Edit `config.js` to change:

| Field | What it controls |
|-------|-----------------|
| `siteTitle` | Site name in header |
| `tagline` | Subtitle below site name |
| `email` | All mailto enquiry links |
| `baseUrl` | Canonical URLs and JSON-LD |
| `social.facebook` | Footer Facebook link |
| `defaultOgImage` | Default Open Graph image path |
| `defaultLeadTimeWeeks` | Fallback lead time for gallery commissions (number, e.g. `3`) |
| `customCommissionLeadTime` | Lead time shown on the custom commission page and mailto (free-text string) |
| `deposit` | Deposit fraction mentioned on commission page (e.g. `0.5` = 50%) |
| `categories` | Array of `{id, label}` objects for product categories (format/medium) |
| `themes` | Array of `{id, label}` objects for product themes (subject matter) |
| `commission.introBlurb` | Intro paragraph on commission.html |
| `commission.leadTimeDisclaimer` | Disclaimer shown after the lead time on commission page |
| `commission.marketsBlurb` | Intro text for the markets section on commission page |

### Lead time fields

- **`defaultLeadTimeWeeks`** (number): Used for `order`-status gallery items. Appears in the commission mailto body as "Lead time understood: ~X weeks."
- **`customCommissionLeadTime`** (string): Used on the commission page and in the custom commission mailto. This is a free-text string — you can write `"4-8 weeks"`, `"currently 6+ weeks — taking bookings for February"`, or whatever suits the current queue.

### Pricing note

- **"from $X AUD"** is shown for all non-available items. The word "from" signals the price is a guide.
- **"$X AUD"** (no "from") is shown for available/in-stock items. This is the firm, pay-this-now price.
- The commission page includes a note explaining that gallery prices are guides and in-stock pieces are the only firm prices.

### Categories & themes

Products can be tagged with a `category` (format/medium) and one or more `theme` values (subject matter). Both lists are defined in `config.js` and drive the filter UI, JSON-LD keywords, and URL hash state.

**Categories** — what the piece physically is:

| ID | Meaning |
|----|---------|
| `framed` | Framed under glass |
| `clocks` | Clock face pieces |
| `canvas` | Quilled paper on canvas |
| `cards` | Greeting cards |
| `homewares` | Sculptural / functional pieces (bowls, vessels, anything 3D and non-wall-mounted) |

**Themes** — what the piece depicts:

| ID | Meaning |
|----|---------|
| `birds` | Bird subjects |
| `animals` | Non-bird, non-insect creatures (cats, fish, sea life, mammals) |
| `insects` | Bees, mantises, butterflies, and other arthropods — often rendered in a "natural history specimen" style with scientific labelling |
| `flowers` | Floral subjects |
| `trees` | Tree / branch subjects |
| `nursery` | Baby / nursery themed |
| `names` | Name or word art |
| `patterns` | Abstract or non-representational designs without a clear subject (e.g. pattern-based clocks, mandalas) |

To add a new category or theme, add a `{id, label}` object to the relevant array in `config.js`. The filter UI picks up additions automatically.

## Logo

The site logo lives at `images/logo.jpg`. It appears in:

- The header on every page (inline with the wordmark)
- The hero section on the gallery (index) page
- Open Graph / Twitter Card image meta tags

When a higher-resolution version is available, consider:

- Adding a `logo-og.jpg` at 1200x630 for better social sharing previews
- Providing a PNG or SVG version for crisper rendering at small sizes
- Regenerating `favicon.svg` to match the logo

## Copyright

The footer displays: **© {year} Quillart by TK. All rights reserved. E&OE.**

- The year updates automatically via JavaScript in `config.js` (targets `.copyright-year` elements)
- Each HTML file has a hardcoded fallback year (currently 2026) for no-JS scenarios
- JSON-LD `copyrightHolder` is the **Organization** "Quillart by TK" (not the individual artist name)
- The artist's legal name "Tracey Keeley" (alternateName "TK") appears only in JSON-LD `Person` entities (e.g. the `provider` on the commission page Service schema)

## File Structure

```
├── index.html         Main gallery page with hero section
├── commission.html    Custom commission landing page (includes markets)
├── events.html        Upcoming markets and events listing
├── about.html         About the artist
├── 404.html           Custom error page
├── styles.css         All styles
├── script.js          Gallery, lightbox, filters, SEO
├── config.js          Site settings (edit for config)
├── products.json      Product data (edit regularly)
├── events.json        Event/market data (edit regularly)
├── images/            Product photos and logo
│   ├── logo.jpg       Site logo
│   └── README.md      Image naming and specs
├── robots.txt         Search engine crawling rules
├── sitemap.xml        Static sitemap
├── favicon.svg        Monogram favicon
└── README.md          This file
```

## SEO

- Each product is deep-linkable via URL hash (e.g., `quillartbytk.com/#item=001`)
- Each event is deep-linkable via anchor (e.g., `quillartbytk.com/events#event-market-001`)
- JSON-LD structured data: site-wide `WebSite`, per-page `ItemList`, per-item `Product`, and `Service` on the commission page
- `order` items use `schema.org/MadeToOrder` availability and include a `priceSpecification` noting the price is a guide
- `copyrightYear` is injected dynamically into the WebSite JSON-LD
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

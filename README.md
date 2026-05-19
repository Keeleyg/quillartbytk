# Quill Art by TK — Product Catalog

Static product catalog for [quillartbytk.com](https://quillartbytk.com), hosted on GitHub Pages with a custom domain via Cloudflare DNS.

## Quick Start

1. Clone this repo
2. Open `index.html` in a browser (or use a local server like `npx serve`)
3. Edit `products.json` to add/update artworks
4. Commit and push — GitHub Pages deploys automatically

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
  "status": "available",
  "image": "images/piece-004.jpg",
  "dateAdded": "2026-06-01"
}
```

3. **Commit and push** to deploy

### Status Values

| Status      | Effect on site                          |
|-------------|-----------------------------------------|
| `available` | Shown normally with "Enquire" button    |
| `reserved`  | "Reserved" badge, no enquire button     |
| `sold`      | "Sold" badge, no enquire button         |

## Updating an Artwork's Status

Edit `products.json` and change the `status` field (e.g., `"available"` → `"sold"`). Commit and push.

## Site Configuration

Edit `config.js` to change:
- Site title and tagline
- Contact email (used in enquiry mailto links)
- Social media URLs
- Base URL

## File Structure

```
├── index.html         Main catalog page
├── about.html         About the artist
├── 404.html           Custom error page
├── styles.css         All styles
├── script.js          Gallery, lightbox, filters, SEO
├── config.js          Site settings
├── products.json      Product data (edit this regularly)
├── images/            Product photos
│   └── README.md      Image naming and specs
├── CNAME              Custom domain for GitHub Pages
├── robots.txt         Search engine crawling rules
├── sitemap.xml        Static sitemap (/, /about)
├── favicon.svg        Monogram favicon
└── README.md          This file
```

## SEO

- Each product is deep-linkable via URL hash (e.g., `quillartbytk.com/#item=001`)
- JSON-LD structured data is generated for the item list and individual products
- Open Graph and Twitter Card tags are included for social sharing
- Products are indexed via JSON-LD on the index page rather than separate URLs

## Domain & Hosting

- **Hosting:** GitHub Pages (auto-deploys from the default branch)
- **Domain:** `quillartbytk.com` (configured via `CNAME` file)
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

## Enquiries

The "Enquire to Purchase" button generates a pre-filled mailto link. When a customer clicks it, their email client opens with a message requesting a Zeller Invoice. You then create the invoice manually via Zeller.

## Tech Stack

Plain HTML, CSS, and vanilla JavaScript. No build step, no frameworks, no npm.

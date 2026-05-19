# quillartbytk — Catalog Status

Site live at https://quillartbytk.com as of 2026-05-19.

Hand-off document for continuing the catalog work in a fresh chat thread.

> **All prices currently set to $50 AUD as launch placeholder.** Tracey to review and set real prices product-by-product.

## Where we are

- **119 product markdown files** in `src/content/products/`
- **10 collection index files** in `src/content/collections/`
- **128 original clusters** (P001–P130, with intentional gaps at P105/P106)
- **Source of truth**: markdown-per-product with YAML frontmatter (CSV archived)
- **Next product ID: P131**
- **114 products `available`**, 5 commissions `order`

## Done

- **Phase 1 (repo prep)**: markdown-per-product, image folders, collections
- **Phase 2 (Astro scaffold)**: 153 static pages, Tailwind v4, content collections, GitHub Pages deploy, Worker stub
- **Phase 3 (inquiry backend)**: Resend integration, admin notification + auto-reply, honeypot spam filter, form refinements
- **Phase 4 (launch prep)**: All prices set to $50, drafts → available, P037 hero, process section, OG default image, Cloudflare Web Analytics snippet

## Known placeholders to revisit

- All prices currently $50 AUD — Tracey to set real prices per product
- About page copy is Phase 2 placeholder (TODO comments in source)
- Commissions page copy is Phase 2 placeholder (TODO comments in source)
- OG default image is P037 main as-is, not a custom 1200×630 composite
- P103 / P104 (Giraffe and Lion with Balloons) still need standalone photos before product pages can be created
- Cloudflare Web Analytics token is a placeholder — replace after enabling in dashboard
- "How it's made" hours range (10–40 hours) is placeholder — Tracey to confirm

## Post-launch backlog

- Set real per-product prices
- Write real About page copy
- Write real Commissions page copy + pricing details
- Custom 1200×630 OG default image
- Testimonials section (when Tracey has quotes)
- Blog / journal (if Tracey wants to share process stories)
- Cart / checkout integration (if sales volume grows beyond email inquiries)
- Google Search Console submission
- Favicon (currently missing — add a proper one)

## ⚠️ CRITICAL: filename verification process

**The previous CSV-era catalog work had ~30 mis-assignments because the assistant attached filenames to clusters based on image-position-in-message rather than verifying each filename↔image pair.** This required a full cleanup pass.

**For every new product added:**
1. View the actual image file
2. Confirm the visual contents match the cluster/role you're about to assign
3. Don't trust ordering, naming similarity, or proximity

## Repository layout

```
quillartbytk/
├── _catalog/
│   ├── STATE.md                       # this file
│   └── archive/
│       └── catalog-wip-final.csv      # archived CSV (277 rows, 128 clusters)
├── images/
│   ├── P001/
│   │   ├── main.jpg
│   │   ├── angle-1.jpg
│   │   └── ...
│   ├── P002/
│   │   └── ...
│   ├── ...                            # one folder per cluster
│   ├── logo.jpg                       # site logo (not a product)
│   └── (28 uncatalogued orphan files) # Facebook ID images not yet in catalog
└── src/
    └── content/
        ├── products/
        │   ├── apple-tree.md           # 119 product files
        │   ├── kookaburra.md
        │   └── ...
        └── collections/
            ├── aussie-birds/
            │   ├── index.md
            │   ├── hero.jpg
            │   └── pair.jpg
            ├── nursery-animals/
            ├── native-bees/
            ├── native-botanicals/
            ├── mini-canvases/
            ├── mini-sea-creatures/
            ├── nautical/
            ├── christmas-cards/
            ├── valentines-cards/
            └── commissions/
```

## Product frontmatter schema

Each `src/content/products/{slug}.md` has YAML frontmatter followed by a markdown description body.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `Pnnn` — original cluster_id, stable internal key |
| `title` | string | Display title for the product |
| `category` | enum | `framed` \| `clocks` \| `canvas` \| `cards` \| `homewares` |
| `themes` | string[] | Subset of approved 12: `trees, patterns, nursery, birds, flowers, insects, animals, nautical, names, seasonal, australiana, pets` |
| `status` | enum | `available` (ready to sell) \| `draft` (needs price/review) \| `order` (commission only) \| `hidden` (not rendered) \| `sold` (one-off sold) |
| `collection` | string\|null | Slug of parent collection, or `null` |
| `commission_example` | boolean | `true` for commission showcase pieces |
| `multi_frame` | boolean | `true` for multi-aperture frame products (P051, P079, P122) |
| `palette_variants` | string[] | Available palette names, e.g. `["rainbow", "autumn"]` |
| `frame_options` | string[] | Available frame colours, e.g. `["white", "oak", "black"]` |
| `price` | number\|null | AUD price, placeholder `null` until set |
| `images.main` | string | Relative path to main product image |
| `images.angles` | string[] | Relative paths to angle/variant images |
| `images.process` | string[] | Relative paths to process/WIP images |
| `confidence` | enum | `high` \| `medium` \| `low` — carried from CSV, for filtering drafts |
| `notes` | string[] | Optional notes from angle/process/drop image descriptions |

## Collection schema

Each `src/content/collections/{slug}/index.md`:

| Field | Type | Notes |
|---|---|---|
| `slug` | string | URL slug for the collection |
| `title` | string | Display title |
| `description` | string | Short description |
| `members` | string[] | Array of cluster IDs (Pnnn) belonging to this collection |
| `hero` | string | Relative path to hero image (usually `./hero.jpg`) |
| `gallery` | string[] | Additional composite/lifestyle images |
| `themes` | string[] | For filtering |
| `order` | number | Display order on site |

## Image naming convention

Inside `images/{cluster_id}/`:
- `main.jpg` — exactly one per product (the canonical product shot)
- `angle-N.jpg` — additional views, numbered by original CSV order
- `process-N.jpg` — work-in-progress shots (P037, P078 so far)
- `drop-N.jpg` — images flagged for review (`?drop` from CSV era)

Inside `src/content/collections/{slug}/`:
- `hero.jpg` — primary collection image
- `pair.jpg`, `trio.jpg`, `trio-2.jpg`, etc. — composite/lifestyle gallery shots

## Structural patterns preserved

- **Palette variants** (`palette_variants` field): P029 (rainbow/autumn), P050 (warm-fire/monochrome), P053 (4 colour vase series), P069 (pink-mauve/white-silver bauble), P092 (cool/warm feather), P093 (blue-gold snowflake), P094 (pink-coral snowflake), P095 (purple-gold snowflake)
- **Frame options** (`frame_options` field): P029 (white/oak/black), P045 (white/oak), P050 (white/black), P060 (white/black), P124 (white/black)
- **Multi-frame** (`multi_frame: true`): P051 Give Yourself Time (3 frames), P079 Native Botanicals Triptych, P122 Native Bees Triptych
- **Mini-canvas series** (11 pieces + P096 extended variant): P048, P049, P054, P055, P059, P067, P091, P101, P110, P112, P113, P096. Own sub-collection: `mini-canvases`
- **Nursery-animals-with-balloons series** (4 + 2 pending): P042, P043, P044, P046 (+ P103 giraffe, P104 lion pending photos). Collection: `nursery-animals`
- **Names / personalised pieces**: P033, P035, P037, P038, P070, P077, P102, P108
- **Word-art / typography**: P033, P035, P037, P038, P051, P062, P064, P070, P077, P102, P108
- **Commission examples** (`commission_example: true`, `status: order`): P037, P070, P077, P102, P108. Collection: `commissions`
- **Cards — Christmas** (9 designs): P065, P068, P072, P089, P090, P093, P094, P095, P107. Collection: `christmas-cards`
- **Cards — Valentine's / love** (12 designs): P019–P023, P063, P074, P076, P085, P087, P097, P109. Collection: `valentines-cards`
- **Seasonal/holiday pieces**: P064 St Patrick's, P065/P068 Christmas cards, P069 bauble, P071–P095 Christmas/seasonal batch

## Sub-collections (10 created)

| Slug | Members | Hero source | Notes |
|---|---|---|---|
| `aussie-birds` | P080, P082, P083, P118, P119, P123 | P084 trio composite | 6 oak-framed native birds |
| `native-bees` | P014, P120, P121, P122 | P122 triptych main (copy) | 3 species + triptych |
| `native-botanicals` | P052, P075, P088, P079 | P079 triptych main (copy) | 3 plants + triptych |
| `nursery-animals` | P042, P043, P044, P046, P103, P104 | P042-44 composite | P103/P104 pending photos |
| `mini-canvases` | P048, P049, P054, P055, P059, P067, P091, P101, P110, P112, P113, P096 | P114 composite | 12 easel pieces |
| `mini-sea-creatures` | P125, P126, P127 | P128 composite | 3 matching white frames |
| `nautical` | P030, P031, P032, P033, P099, P100, P129, P130 | P030 sailboat main (copy) | 8 rope-edged pieces; P098 trio as gallery |
| `christmas-cards` | P065, P068, P072, P089, P090, P093, P094, P095, P107 | P072 string-of-lights (copy) | 9 card designs |
| `valentines-cards` | P019–P023, P063, P074, P076, P085, P087, P097, P109 | P019 filigree heart (copy) | 12 card designs |
| `commissions` | P037, P070, P077, P102, P108 | P037 Heidi (copy) | 5 commission examples |

## Pending decisions for Tracey

1. **P052 typo**: physical artwork plaque reads "Corumbia" — should be "Corymbia". Needs reprinting before listing goes live. (Product markdown text is correct; note is about the physical plaque.)
2. **P037 process shots** flagged for commission-page use.
3. **`drop-N.jpg` images** — decide keep/drop/repurpose for each:
   - P008 (loose bird figures)
   - P018 (3-product composite)
   - P019 drop-1 (loose hearts inventory)
   - P034 (nautical trio composite)
   - P103-04 (giraffe+lion composite — no standalone photos yet)
4. **Standalone photos needed** for P103 (Giraffe with Balloons) and P104 (Lion with Balloons) before product pages can be created.
5. **Pricing**: all products currently `price: null`, `status: draft`. Need AUD prices set (placeholder guidance: ~$50 framed, $8 cards).
6. **Status review**: decide which products are `available` vs remain `draft`.
7. **28 uncatalogued images** in `images/` root — process as P131+ when ready.

## Watch-items (potential new themes/categories — not yet added)

| Concept | Count | Status |
|---|---|---|
| `seasonal` | ~20 | **Added** |
| `australiana` | ~14 | **Added** |
| `pets` | 3 (P060, P066, P102) | **Added** |
| `figures` | 2 (P040, P116 ballerina) | Hold |
| `ornaments` / 3D | 2 (P069, P073) | Hold |
| `objects` | 1 (P050) | Hold |
| `mythological` | 1 (P061) | Hold |

## Known anomalies (intentional)

- **P105 and P106** are intentional gaps in cluster numbering
- **Composite-placeholder clusters** have no product markdown: P008, P018, P034, P042-44, P084, P098, P103-04, P114, P128. Their images live in `images/{id}/` (as drop-N.jpg) or in collection folders (as hero/gallery).
- **P103 and P104** are listed as nursery-animals collection members but have no product files — awaiting standalone photos
- Some `medium` / `low` confidence rows are review markers, not deletion candidates
- **P032 angle-1** has `confidence: low` with a note about spout count mismatch — verify before going live
- Seven `(1)` suffix duplicate re-uploads in `images/` root — safe to delete on sight

## Workflow for new images

1. View the image file to confirm contents
2. Decide: new product cluster or additional angle/variant of existing?
3. If **new product**:
   - Create `images/P{next}/main.jpg` (+ angle-N.jpg, process-N.jpg as needed)
   - Create `src/content/products/{slug}.md` with full frontmatter + description
   - If it belongs to a collection, add its ID to the collection's `members:` array
4. If **new angle/variant**:
   - Add image to `images/P{existing}/angle-{next}.jpg`
   - Update the product markdown's `images.angles` array
   - Add a note if the image has a useful description
5. Verify the filename-to-image pairing visually before committing

## Suggested kickoff prompt for Phase 2

> Continuing the quillartbytk catalog rebuild. Phase 1 (repo prep) is complete: 119 product markdown files in `src/content/products/`, 10 collection folders in `src/content/collections/`, images restructured into `images/{cluster_id}/` folders.
>
> Please read `_catalog/STATE.md` for full context (frontmatter schema, collection schema, structural patterns, pending decisions).
>
> Phase 2: Scaffold the Astro static site. Target stack: Astro, Tailwind CSS, GitHub Pages, Cloudflare DNS, Cloudflare Pages Functions for the inquiry form. The markdown files and image paths are ready to plug into Astro content collections.

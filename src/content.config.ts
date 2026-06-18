import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* ------------------------------------------------------------------ */
/*  Shared enums — keep in sync with _catalog/STATE.md                */
/* ------------------------------------------------------------------ */
export const VALID_THEMES = [
  'trees', 'misc', 'nursery', 'birds', 'flowers', 'insects',
  'animals', 'nautical', 'names', 'seasonal', 'australiana', 'pets',
] as const;

export const VALID_CATEGORIES = [
  'framed', 'clocks', 'canvas', 'cards', 'homewares',
] as const;

export const VALID_STATUS = [
  'available', 'order', 'sold',
] as const;

/* ------------------------------------------------------------------ */
/*  Products — src/content/products/*.md                              */
/* ------------------------------------------------------------------ */
const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/products' }),
  schema: z.object({
    id: z.string().regex(/^P\d{3}$/),
    title: z.string(),
    category: z.enum(VALID_CATEGORIES),
    themes: z.array(z.enum(VALID_THEMES)).min(1),
    status: z.enum(VALID_STATUS).default('available'),
    hidden: z.boolean().default(false),
    featured: z.boolean().default(false),
    collection: z.string().nullable().default(null),
    commission_example: z.boolean().default(false),
    multi_frame: z.boolean().default(false),
    palette_variants: z.array(z.string()).default([]),
    frame_options: z.array(z.string()).default([]),
    price: z.number().nullable().default(null),
    lead_time: z.string().nullable().default(null),
    /* Card-only attributes (omitted for non-card categories) */
    card_occasion: z.string().optional(),
    card_size: z.string().optional(),
    card_envelope_colour: z.string().optional(),
    card_blank_inside: z.boolean().optional(),
    card_includes_envelope: z.boolean().optional(),
    card_customisable: z.boolean().optional(),
    images: z.object({
      main: z.string(),
      angles: z.array(z.string()).default([]),
      process: z.array(z.string()).default([]),
    }),
    confidence: z.enum(['high', 'medium', 'low']).default('high'),
    notes: z.array(z.string()).optional(),
  }),
});

/* ------------------------------------------------------------------ */
/*  Collections — src/content/collections/{slug}/index.md             */
/* ------------------------------------------------------------------ */
const collectionsData = defineCollection({
  loader: glob({ pattern: '**/index.md', base: 'src/content/collections' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    members: z.array(z.string()),
    hero: z.string(),
    gallery: z.array(z.string()).default([]),
    themes: z.array(z.enum(VALID_THEMES)).default([]),
    order: z.number().default(100),
  }),
});

/* ------------------------------------------------------------------ */
export const collections = {
  products,
  collections: collectionsData,
};

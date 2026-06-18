import type { CollectionEntry } from 'astro:content';

type Product = CollectionEntry<'products'>;

/**
 * Visibility is controlled ONLY by the hide flag. The site is a portfolio of
 * completed works, so sold pieces stay on display (just without a price) — the
 * sale status is informational, not a visibility gate.
 */
export function isHidden(p: Product): boolean {
  return p.data.hidden === true || p.data.status === 'hidden';
}

export function isVisible(p: Product): boolean {
  return !isHidden(p);
}

/** Buyable now: visible AND status "available" (the Store filter). */
export function isAvailable(p: Product): boolean {
  return !isHidden(p) && p.data.status === 'available';
}

/** On sale: available, with both a price and a (lower) sale price set. */
export function isOnSale(p: Product): boolean {
  return p.data.status === 'available' && p.data.price != null && p.data.sale_price != null;
}

/** Set of visible product ids — handy for filtering collection members. */
export function visibleIdSet(products: Product[]): Set<string> {
  return new Set(products.filter(isVisible).map((p) => p.data.id));
}

/** How the price should read in listings and on the detail page. */
export function priceLabel(p: Product): string {
  const { status, price } = p.data;
  if (status === 'sold') return 'Sold';
  if (price != null) return `$${price}`;
  if (status === 'order') return 'Made to order';
  return 'Inquire';
}

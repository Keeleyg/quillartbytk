import type { CollectionEntry } from 'astro:content';
import { isVisible } from './products';

type Product = CollectionEntry<'products'>;
type Collection = CollectionEntry<'collections'>;

/**
 * The members that actually render on the site, in `members`-array order.
 *
 * A member renders when its ID resolves to an existing product that is visible
 * (not hidden). This mirrors the long-standing skip rules used on the collection
 * page: orphaned IDs awaiting photos (e.g. P103/P104) resolve to nothing and are
 * dropped, and hidden pieces are dropped too. Keep this the single source of
 * truth so the collection page, the collections index, the home teasers and the
 * product-page "Part of the …" link all agree on what counts.
 */
export function renderableMembers(collection: Collection, products: Product[]): Product[] {
  const byId = new Map(products.map((p) => [p.data.id, p]));
  return collection.data.members
    .map((id) => byId.get(id))
    .filter((p): p is Product => Boolean(p) && isVisible(p!));
}

/** How many members would actually display. */
export function renderableMemberCount(collection: Collection, products: Product[]): number {
  return renderableMembers(collection, products).length;
}

/** A collection is shown on the site only when it has at least one renderable member. */
export function hasRenderableMembers(collection: Collection, products: Product[]): boolean {
  return renderableMemberCount(collection, products) > 0;
}

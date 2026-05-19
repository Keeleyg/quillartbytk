/**
 * Convert a relative frontmatter image path to an absolute URL.
 *
 * Product images:
 *   ../../../images/P029/main.jpg  →  /images/P029/main.jpg
 *
 * Collection images:
 *   ./hero.jpg  →  /collections/{slug}/hero.jpg
 */
export function resolveProductImage(relativePath: string): string {
  // Strip leading ../ segments and normalise to /images/...
  const match = relativePath.match(/images\/(P\d{3}\/.+)$/);
  if (match) return `/images/${match[1]}`;
  // Fallback: strip all leading dots/slashes
  return '/' + relativePath.replace(/^[./\\]+/, '');
}

export function resolveCollectionImage(
  relativePath: string,
  collectionSlug: string,
): string {
  // ./hero.jpg → /collections/aussie-birds/hero.jpg
  const filename = relativePath.replace(/^\.\//, '');
  return `/collections/${collectionSlug}/${filename}`;
}

/** Title-case a slug: "mini-canvases" → "Mini Canvases" */
export function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Pretty category name */
export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    framed: 'Framed Art',
    clocks: 'Clocks',
    canvas: 'Canvas',
    cards: 'Cards',
    homewares: 'Homewares',
  };
  return labels[cat] ?? titleCase(cat);
}

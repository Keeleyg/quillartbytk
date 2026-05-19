/** Base URL from Astro config, without trailing slash */
const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

/**
 * Convert a relative frontmatter image path to an absolute URL.
 *
 * Product images:
 *   ../../../images/P029/main.jpg  →  /quillartbytk/images/P029/main.jpg
 *
 * Collection images:
 *   ./hero.jpg  →  /quillartbytk/collections/{slug}/hero.jpg
 */
export function resolveProductImage(relativePath: string): string {
  // Strip leading ../ segments and normalise to {base}/images/...
  const match = relativePath.match(/images\/(P\d{3}\/.+)$/);
  if (match) return `${base}/images/${match[1]}`;
  // Fallback: strip all leading dots/slashes
  return `${base}/` + relativePath.replace(/^[./\\]+/, '');
}

export function resolveCollectionImage(
  relativePath: string,
  collectionSlug: string,
): string {
  // ./hero.jpg → {base}/collections/aussie-birds/hero.jpg
  const filename = relativePath.replace(/^\.\//, '');
  return `${base}/collections/${collectionSlug}/${filename}`;
}

/** Resolve a site-root-relative path with the configured base URL */
export function url(path: string): string {
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
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

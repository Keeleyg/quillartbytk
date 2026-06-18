# Product Images

Each piece has its own folder named after its catalogue id: **`images/P###/`** (e.g. `images/P037/`). Frontmatter in `src/content/products/<slug>.md` references files by path **relative to `images/`**:

```yaml
images:
  main: P037/main.jpg          # required hero image
  angles: [P037/angle-1.jpg]   # alternate views of the finished piece
  process: [P037/wip-1.jpg]    # making-of shots (lightbox “how it’s made” only)
```

At build time these folders are copied into `dist/images/` by the `copyImages` integration in `astro.config.mjs`. During `npm run dev` they're served from disk by the `imageServer` Vite plugin.

> The [admin tool](../README.md#admin-tool-gallery-editor) manages images for you — adding, swapping the main image, moving an angle to another item, reordering, and "deleting" (which moves the file up to the `images/` root rather than erasing it). Site chrome images (`logo.jpg`, `favicon.svg`) live in `public/`, not here.

## Roles

| Role | Where it shows |
|------|----------------|
| `main` | Store/Gallery card, product‑page hero, lightbox, social preview |
| `angles` | Product‑page thumbnail strip + lightbox |
| `process` | Lightbox “how it's made” strip only — never a card thumbnail |

## Recommended specs

- **Format:** JPEG (`.jpg`) — best quality/size balance for photos.
- **Dimensions:** at least 1200px on the longest side (looks crisp in the lightbox).
- **File size:** aim for under ~300 KB — compress with [Squoosh](https://squoosh.app/) or similar.
- **Colour space:** sRGB.
- **Background:** neutral / white photographs best.
- **Filenames:** lowercase with hyphens, no spaces.

## Tips

- Photograph in natural, diffused light to show the 3D texture of the quilling.
- Use a straight‑on shot as the `main` image.

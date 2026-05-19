import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { readdir, copyFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/*  Custom Vite plugin: serve product + collection images during dev  */
/* ------------------------------------------------------------------ */
function imageServer() {
  const root = fileURLToPath(new URL('.', import.meta.url));

  return {
    name: 'quillartbytk:image-server',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();

        let decoded = decodeURIComponent(req.url.split('?')[0]);

        // Strip base path prefix if present (e.g. /quillartbytk/images/... → /images/...)
        const basePath = '/quillartbytk';
        if (decoded.startsWith(basePath + '/')) {
          decoded = decoded.slice(basePath.length);
        }

        // /images/P029/main.jpg  →  <root>/images/P029/main.jpg
        if (decoded.startsWith('/images/')) {
          const fsPath = join(root, decoded.slice(1));
          req.url = '/@fs/' + fsPath.replace(/\\/g, '/');
          return next();
        }

        // /collections/aussie-birds/hero.jpg  →  <root>/src/content/collections/aussie-birds/hero.jpg
        if (decoded.startsWith('/collections/') && /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(decoded)) {
          const fsPath = join(root, 'src', 'content', decoded.slice(1));
          req.url = '/@fs/' + fsPath.replace(/\\/g, '/');
          return next();
        }

        next();
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Custom Astro integration: copy images into dist/ at build time    */
/* ------------------------------------------------------------------ */
function copyImages() {
  const root = fileURLToPath(new URL('.', import.meta.url));

  /** Recursively copy a directory tree */
  async function copyDir(src, dest) {
    let entries;
    try {
      entries = await readdir(src, { withFileTypes: true });
    } catch {
      return; // source dir missing — skip silently
    }
    await mkdir(dest, { recursive: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  }

  return {
    name: 'quillartbytk:copy-images',
    hooks: {
      async 'astro:build:done'({ dir }) {
        const distPath = fileURLToPath(dir);

        // Copy product images: images/P*/ → dist/images/P*/
        const imagesRoot = join(root, 'images');
        const entries = await readdir(imagesRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('P')) {
            await copyDir(
              join(imagesRoot, entry.name),
              join(distPath, 'images', entry.name)
            );
          }
        }

        // Copy collection images: src/content/collections/*/  (only image files)
        const collectionsRoot = join(root, 'src', 'content', 'collections');
        const colEntries = await readdir(collectionsRoot, { withFileTypes: true });
        for (const colEntry of colEntries) {
          if (!colEntry.isDirectory()) continue;
          const colDir = join(collectionsRoot, colEntry.name);
          const files = await readdir(colDir);
          for (const file of files) {
            if (/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(file)) {
              const destDir = join(distPath, 'collections', colEntry.name);
              await mkdir(destDir, { recursive: true });
              await copyFile(join(colDir, file), join(destDir, file));
            }
          }
        }
      },
    },
  };
}

/* ------------------------------------------------------------------ */
export default defineConfig({
  site: 'https://keeleyg.github.io',
  base: '/quillartbytk',
  output: 'static',
  integrations: [sitemap(), copyImages()],
  vite: {
    plugins: [tailwindcss(), imageServer()],
  },
});

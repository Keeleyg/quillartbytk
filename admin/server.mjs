/**
 * Local-only gallery admin server for Quillart by TK.
 *
 *   npm run admin        → starts http://localhost:4321/admin-tool
 *
 * Runs ONLY on your machine. It reads and writes the product markdown files
 * in src/content/products and the image folders in images/, and the Publish
 * button commits + pushes those changes with git. Nothing here is ever
 * deployed to the public site — it lives outside Astro's build.
 *
 * Login credentials live in admin/credentials.json (gitignored). Create them
 * once with:  npm run admin:setup
 */
import express from 'express';
import matter from 'gray-matter';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, unlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PRODUCTS_DIR = join(ROOT, 'src', 'content', 'products');
const COLLECTIONS_DIR = join(ROOT, 'src', 'content', 'collections');
const IMAGES_DIR = join(ROOT, 'images');
const CREDS_PATH = join(__dirname, 'credentials.json');

const PORT = 4321;
const PORT_FALLBACK = 4331;

/* ---- shared enums (mirror src/content.config.ts) ------------------- */
const VALID_THEMES = [
  'trees', 'patterns', 'nursery', 'birds', 'flowers', 'insects',
  'animals', 'nautical', 'names', 'seasonal', 'australiana', 'pets',
];
const VALID_CATEGORIES = ['framed', 'clocks', 'canvas', 'cards', 'homewares'];
const VALID_STATUS = ['available', 'draft', 'order', 'hidden', 'sold'];

/* ---- git helpers --------------------------------------------------- */
async function git(args) {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  return (stdout || '') + (stderr || '');
}
async function currentBranch() {
  return (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

/* ---- credentials / auth ------------------------------------------- */
if (!existsSync(CREDS_PATH)) {
  console.error('\n  No credentials found. Run:  npm run admin:setup\n');
  process.exit(1);
}
const creds = JSON.parse(await readFile(CREDS_PATH, 'utf8'));
const sessions = new Map(); // token -> expiry ms
const SESSION_MS = 8 * 60 * 60 * 1000;

function checkPassword(username, password) {
  if (username !== creds.username) return false;
  const hash = createHash('sha256').update(creds.salt + password).digest('hex');
  const a = Buffer.from(hash);
  const b = Buffer.from(creds.passwordHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
function issueToken() {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}
function requireAuth(req, res, next) {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/* ---- product helpers ---------------------------------------------- */
const FM_PREFIX = '../../../images/';

/** frontmatter path (../../../images/P037/main.jpg) -> preview url (/img/P037/main.jpg) */
function toPreviewUrl(fmPath) {
  const m = String(fmPath).match(/images\/(.+)$/);
  return m ? '/img/' + m[1] : fmPath;
}
function listMarkdown(dir) {
  return readdir(dir).then((files) => files.filter((f) => f.endsWith('.md')));
}
async function readProduct(slug) {
  const file = join(PRODUCTS_DIR, slug + '.md');
  if (!existsSync(file)) return null;
  const raw = await readFile(file, 'utf8');
  const { data, content } = matter(raw);
  return { slug, file, data, body: content };
}

/** Rebuild frontmatter in canonical (schema) order, then write the file. */
async function writeProduct(slug, data, body) {
  const ordered = {
    id: data.id,
    title: data.title,
    category: data.category,
    themes: data.themes,
    status: data.status,
    collection: data.collection ?? null,
    commission_example: data.commission_example ?? false,
    multi_frame: data.multi_frame ?? false,
    palette_variants: data.palette_variants ?? [],
    frame_options: data.frame_options ?? [],
    price: data.price ?? null,
    lead_time: data.lead_time ?? null,
    images: {
      main: data.images.main,
      angles: data.images.angles ?? [],
      process: data.images.process ?? [],
    },
    confidence: data.confidence ?? 'high',
  };
  if (data.notes !== undefined) ordered.notes = data.notes;
  const file = join(PRODUCTS_DIR, slug + '.md');
  const out = matter.stringify(body, ordered);
  await writeFile(file, out, 'utf8');
}

function imagesView(data) {
  return {
    main: { path: data.images.main, url: toPreviewUrl(data.images.main) },
    angles: (data.images.angles ?? []).map((p) => ({ path: p, url: toPreviewUrl(p) })),
    process: (data.images.process ?? []).map((p) => ({ path: p, url: toPreviewUrl(p) })),
  };
}

/** Find the next free angle-N / process-N name in a product's image folder. */
async function nextImageName(id, role, ext) {
  const folder = join(IMAGES_DIR, id);
  await mkdir(folder, { recursive: true });
  const existing = existsSync(folder) ? await readdir(folder) : [];
  const prefix = role === 'process' ? 'process-' : 'angle-';
  let n = 1;
  while (existing.includes(`${prefix}${n}${ext}`)) n++;
  return `${prefix}${n}${ext}`;
}

/* ---- app ----------------------------------------------------------- */
const app = express();
app.use(express.json({ limit: '30mb' }));

// Public product photos for previews (local only, not secret).
app.use('/img', express.static(IMAGES_DIR));
// The editor UI.
app.use('/admin-tool', express.static(join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/admin-tool/'));

/* ---- login -------------------------------------------------------- */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (checkPassword(String(username || ''), String(password || ''))) {
    return res.json({ token: issueToken() });
  }
  await new Promise((r) => setTimeout(r, 600)); // throttle guesses
  res.status(401).json({ error: 'Invalid username or password' });
});

/* ---- metadata ----------------------------------------------------- */
app.get('/api/meta', requireAuth, async (_req, res) => {
  let collections = [];
  try {
    const slugs = await readdir(COLLECTIONS_DIR, { withFileTypes: true });
    for (const d of slugs) {
      if (!d.isDirectory()) continue;
      const idx = join(COLLECTIONS_DIR, d.name, 'index.md');
      if (existsSync(idx)) {
        const { data } = matter(await readFile(idx, 'utf8'));
        collections.push({ slug: data.slug ?? d.name, title: data.title ?? d.name });
      }
    }
  } catch { /* none */ }
  res.json({
    categories: VALID_CATEGORIES,
    themes: VALID_THEMES,
    statuses: VALID_STATUS,
    collections,
    branch: await currentBranch().catch(() => 'unknown'),
  });
});

/* ---- list products ------------------------------------------------ */
app.get('/api/products', requireAuth, async (_req, res) => {
  const files = await listMarkdown(PRODUCTS_DIR);
  const items = [];
  for (const f of files) {
    const slug = basename(f, '.md');
    try {
      const { data } = matter(await readFile(join(PRODUCTS_DIR, f), 'utf8'));
      items.push({
        slug,
        id: data.id,
        title: data.title,
        category: data.category,
        status: data.status,
        mainUrl: toPreviewUrl(data.images?.main ?? ''),
      });
    } catch { /* skip unparseable */ }
  }
  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  res.json(items);
});

/* ---- get one product ---------------------------------------------- */
app.get('/api/products/:slug', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({
    slug: p.slug,
    id: p.data.id,
    title: p.data.title,
    category: p.data.category,
    themes: p.data.themes ?? [],
    status: p.data.status,
    collection: p.data.collection ?? null,
    commission_example: !!p.data.commission_example,
    multi_frame: !!p.data.multi_frame,
    palette_variants: p.data.palette_variants ?? [],
    frame_options: p.data.frame_options ?? [],
    price: p.data.price ?? null,
    lead_time: p.data.lead_time ?? null,
    confidence: p.data.confidence ?? 'high',
    body: p.body.trim(),
    images: imagesView(p.data),
  });
});

/* ---- save product fields ------------------------------------------ */
app.put('/api/products/:slug', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};

  // Validate / coerce
  if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
  if (!VALID_CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'Invalid category' });
  const themes = Array.isArray(b.themes) ? b.themes.filter((t) => VALID_THEMES.includes(t)) : [];
  if (themes.length < 1) return res.status(400).json({ error: 'Pick at least one theme' });
  if (!VALID_STATUS.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });

  let price = null;
  if (b.price !== null && b.price !== '' && b.price !== undefined) {
    const n = Number(b.price);
    if (Number.isNaN(n)) return res.status(400).json({ error: 'Price must be a number' });
    price = n;
  }
  const leadTime = b.lead_time && String(b.lead_time).trim() ? String(b.lead_time).trim() : null;
  const collection = b.collection && String(b.collection).trim() ? String(b.collection).trim() : null;

  const next = {
    ...p.data,
    title: String(b.title).trim(),
    category: b.category,
    themes,
    status: b.status,
    collection,
    commission_example: !!b.commission_example,
    multi_frame: !!b.multi_frame,
    palette_variants: Array.isArray(b.palette_variants) ? b.palette_variants.map(String) : [],
    frame_options: Array.isArray(b.frame_options) ? b.frame_options.map(String) : [],
    price,
    lead_time: leadTime,
    confidence: ['high', 'medium', 'low'].includes(b.confidence) ? b.confidence : (p.data.confidence ?? 'high'),
  };

  const body = typeof b.body === 'string' ? b.body.trim() + '\n' : p.body;
  await writeProduct(req.params.slug, next, body);
  res.json({ ok: true });
});

/* ---- add image ---------------------------------------------------- */
app.post('/api/products/:slug/images', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { role, filename, dataBase64 } = req.body || {};
  if (!['main', 'angles', 'process'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (!dataBase64) return res.status(400).json({ error: 'No image data' });

  let ext = extname(String(filename || '')).toLowerCase();
  if (!/^\.(jpe?g|png|webp|avif|gif)$/.test(ext)) ext = '.jpg';

  const id = p.data.id;
  const folder = join(IMAGES_DIR, id);
  await mkdir(folder, { recursive: true });

  const name = role === 'main' ? `main${ext}` : await nextImageName(id, role, ext);
  const buf = Buffer.from(String(dataBase64).replace(/^data:[^,]+,/, ''), 'base64');
  await writeFile(join(folder, name), buf);

  const fmPath = `${FM_PREFIX}${id}/${name}`;
  if (role === 'main') {
    p.data.images.main = fmPath;
  } else {
    p.data.images[role] = [...(p.data.images[role] ?? []), fmPath];
  }
  await writeProduct(req.params.slug, p.data, p.body);
  res.json({ ok: true, images: imagesView(p.data) });
});

/* ---- delete image ------------------------------------------------- */
app.delete('/api/products/:slug/images', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { role, path } = req.body || {};
  if (role === 'main') return res.status(400).json({ error: 'Main image is required — replace it instead of deleting.' });
  if (!['angles', 'process'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const list = p.data.images[role] ?? [];
  if (!list.includes(path)) return res.status(404).json({ error: 'Image not found on this product' });
  p.data.images[role] = list.filter((x) => x !== path);

  // Remove the physical file too.
  const m = String(path).match(/images\/(.+)$/);
  if (m) {
    const file = join(IMAGES_DIR, m[1]);
    if (existsSync(file)) await unlink(file).catch(() => {});
  }
  await writeProduct(req.params.slug, p.data, p.body);
  res.json({ ok: true, images: imagesView(p.data) });
});

/* ---- pending changes for a product -------------------------------- */
app.get('/api/products/:slug/status', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const paths = [`src/content/products/${req.params.slug}.md`, `images/${p.data.id}`];
  const out = await git(['status', '--porcelain', '--', ...paths]).catch(() => '');
  res.json({ dirty: out.trim().length > 0, detail: out.trim() });
});

/* ---- publish (commit + push) -------------------------------------- */
app.post('/api/products/:slug/publish', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const slug = req.params.slug;
  const mdPath = `src/content/products/${slug}.md`;
  const imgPath = `images/${p.data.id}`;

  try {
    await git(['add', '-A', '--', mdPath, imgPath]);
    const staged = (await git(['diff', '--cached', '--name-only'])).trim();
    if (!staged) {
      return res.json({ ok: true, committed: false, message: 'No changes to publish.' });
    }
    const branch = await currentBranch();
    const msg = `Admin: update ${p.data.title} (${p.data.id})`;
    await git(['commit', '-m', msg]);
    const pushOut = await git(['push', 'origin', branch]);
    res.json({
      ok: true,
      committed: true,
      branch,
      message: `Published to ${branch}. The live site rebuilds in ~1–2 minutes.`,
      detail: pushOut.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Publish failed', detail: String(err.stderr || err.message || err) });
  }
});

/* ---- start (with port fallback) ----------------------------------- */
function start(port) {
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`\n  Gallery admin running →  http://localhost:${port}/admin-tool/`);
    console.log(`  (local only — press Ctrl+C to stop)\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port === PORT) {
      console.warn(`  Port ${PORT} busy, trying ${PORT_FALLBACK}…`);
      start(PORT_FALLBACK);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}
start(PORT);

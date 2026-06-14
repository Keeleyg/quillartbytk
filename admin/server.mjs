/**
 * Local-only gallery admin server for Quillart by TK.
 *
 *   npm run admin        → http://localhost:4399/admin-tool/
 *
 * Runs ONLY on your machine. Edits accumulate on a local branch
 * (gallery-edits) so nothing goes live until you choose to publish:
 *
 *   • Editing            → writes + commits to the gallery-edits branch
 *   • Build preview      → astro build, served at the site root for review
 *   • Commit (publish)   → squash-merge gallery-edits → main, push (goes live)
 *   • Discard            → delete the gallery-edits branch entirely
 *
 * Unpublished edits persist on the branch, so closing and reopening the editor
 * shows your work-in-progress until you Commit or Discard.
 *
 * Login credentials live in admin/credentials.json (gitignored). Create them
 * once with:  npm run admin:setup
 */
import express from 'express';
import matter from 'gray-matter';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, unlink, copyFile } from 'node:fs/promises';
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
const EVENTS_PATH = join(ROOT, 'src', 'data', 'events.json');
const DIST_DIR = join(ROOT, 'dist');
const CREDS_PATH = join(__dirname, 'credentials.json');
const ASTRO_BIN = join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');

const PORT = Number(process.env.ADMIN_PORT) || 4399;
const PORT_FALLBACK = 4400;

/* Branch model — overridable via env for testing. */
const LIVE_BRANCH = process.env.ADMIN_LIVE_BRANCH || 'main';
const DRAFT_BRANCH = process.env.ADMIN_DRAFT_BRANCH || 'gallery-edits';
const NO_PUSH = process.env.ADMIN_NO_PUSH === '1';

/* ---- shared enums (mirror src/content.config.ts) ------------------- */
const VALID_THEMES = [
  'trees', 'patterns', 'nursery', 'birds', 'flowers', 'insects',
  'animals', 'nautical', 'names', 'seasonal', 'australiana', 'pets',
];
const VALID_CATEGORIES = ['framed', 'clocks', 'canvas', 'cards', 'homewares'];
const VALID_STATUS = ['available', 'draft', 'order', 'hidden', 'sold'];

/* ---- git helpers --------------------------------------------------- */
async function git(args) {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
  return (stdout || '') + (stderr || '');
}
async function currentBranch() {
  return (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}
async function branchExists(name) {
  try { await git(['rev-parse', '--verify', '--quiet', 'refs/heads/' + name]); return true; }
  catch { return false; }
}
async function treeCleanTracked() {
  return (await git(['status', '--porcelain', '--untracked-files=no'])).trim() === '';
}
async function aheadCount() {
  if (!(await branchExists(DRAFT_BRANCH))) return 0;
  return Number((await git(['rev-list', '--count', `${LIVE_BRANCH}..${DRAFT_BRANCH}`])).trim()) || 0;
}

/** Make sure we're on the draft branch (creating it off LIVE_BRANCH if needed). */
async function ensureDraft() {
  if ((await currentBranch()) === DRAFT_BRANCH) return;
  if (!(await treeCleanTracked())) {
    throw new Error('Your repo has uncommitted changes outside the editor. Commit or stash them first.');
  }
  if (await branchExists(DRAFT_BRANCH)) {
    await git(['checkout', DRAFT_BRANCH]);
  } else {
    await git(['checkout', LIVE_BRANCH]);
    await git(['checkout', '-b', DRAFT_BRANCH]);
  }
}

/** Stage given paths and commit if anything changed. */
async function commitDraft(message, paths) {
  await git(['add', '-A', '--', ...paths]);
  const staged = (await git(['diff', '--cached', '--name-only'])).trim();
  if (staged) await git(['commit', '-m', message]);
}

/* ---- credentials / auth ------------------------------------------- */
if (!existsSync(CREDS_PATH)) {
  console.error('\n  No credentials found. Run:  npm run admin:setup\n');
  process.exit(1);
}
const creds = JSON.parse(await readFile(CREDS_PATH, 'utf8'));
const sessions = new Map();
const SESSION_MS = 8 * 60 * 60 * 1000;

function checkPassword(username, password) {
  if (username !== creds.username) return false;
  const hash = createHash('sha256').update(creds.salt + password).digest('hex');
  const a = Buffer.from(hash), b = Buffer.from(creds.passwordHash);
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
  const { data, content } = matter(await readFile(file, 'utf8'));
  return { slug, file, data, body: content };
}
async function writeProduct(slug, data, body) {
  const ordered = {
    id: data.id,
    title: data.title,
    category: data.category,
    themes: data.themes,
    status: data.status,
    hidden: data.hidden ?? false,
    featured: data.featured ?? false,
    collection: data.collection ?? null,
    commission_example: data.commission_example ?? false,
    multi_frame: data.multi_frame ?? false,
    palette_variants: data.palette_variants ?? [],
    frame_options: data.frame_options ?? [],
    price: data.price ?? null,
    lead_time: data.lead_time ?? null,
  };
  // Card-only attributes — written only for cards, omitted everywhere else.
  if (data.category === 'cards') {
    if (data.card_occasion) ordered.card_occasion = data.card_occasion;
    if (data.card_size) ordered.card_size = data.card_size;
    if (data.card_envelope_colour) ordered.card_envelope_colour = data.card_envelope_colour;
    ordered.card_blank_inside = !!data.card_blank_inside;
    ordered.card_includes_envelope = !!data.card_includes_envelope;
    ordered.card_customisable = !!data.card_customisable;
  }
  ordered.images = {
    main: data.images.main,
    angles: data.images.angles ?? [],
    process: data.images.process ?? [],
  };
  ordered.confidence = data.confidence ?? 'high';
  if (data.notes !== undefined) ordered.notes = data.notes;
  await writeFile(join(PRODUCTS_DIR, slug + '.md'), matter.stringify(body, ordered), 'utf8');
}
function imagesView(data) {
  return {
    main: { path: data.images.main, url: toPreviewUrl(data.images.main) },
    angles: (data.images.angles ?? []).map((p) => ({ path: p, url: toPreviewUrl(p) })),
    process: (data.images.process ?? []).map((p) => ({ path: p, url: toPreviewUrl(p) })),
  };
}
async function nextImageName(id, role, ext) {
  const folder = join(IMAGES_DIR, id);
  await mkdir(folder, { recursive: true });
  const existing = existsSync(folder) ? await readdir(folder) : [];
  const prefix = role === 'process' ? 'process-' : 'angle-';
  let n = 1;
  while (existing.includes(`${prefix}${n}${ext}`)) n++;
  return `${prefix}${n}${ext}`;
}

function slugify(s) {
  return (
    String(s).toLowerCase().trim()
      .replace(/['"’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'new-piece'
  );
}
async function uniqueSlug(base) {
  let slug = base, n = 2;
  while (existsSync(join(PRODUCTS_DIR, slug + '.md'))) slug = `${base}-${n++}`;
  return slug;
}
async function nextProductId() {
  let max = 0;
  for (const f of await listMarkdown(PRODUCTS_DIR)) {
    try {
      const { data } = matter(await readFile(join(PRODUCTS_DIR, f), 'utf8'));
      const n = parseInt(String(data.id || '').replace(/^P/, ''), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    } catch { /* skip */ }
  }
  if (max + 1 > 999) throw new Error('Product id limit reached (P999).');
  return 'P' + String(max + 1).padStart(3, '0');
}

/** id -> {slug,title} index from the current working tree. */
async function indexProducts() {
  const byId = new Map();
  for (const f of await listMarkdown(PRODUCTS_DIR)) {
    try {
      const { data } = matter(await readFile(join(PRODUCTS_DIR, f), 'utf8'));
      byId.set(data.id, { slug: basename(f, '.md'), title: data.title, id: data.id });
    } catch { /* skip */ }
  }
  return byId;
}

/** Products changed on the draft branch vs live. */
async function changedProducts() {
  if (!(await branchExists(DRAFT_BRANCH))) return [];
  const diff = (await git(['diff', '--name-only', `${LIVE_BRANCH}...${DRAFT_BRANCH}`])).trim();
  if (!diff) return [];
  const byId = await indexProducts();
  const out = new Map();
  for (const line of diff.split('\n')) {
    let m = line.match(/^src\/content\/products\/(.+)\.md$/);
    if (m) {
      const slug = m[1];
      const hit = [...byId.values()].find((p) => p.slug === slug);
      out.set(slug, hit || { slug, title: slug, id: '' });
      continue;
    }
    m = line.match(/^images\/(P\d{3})\//);
    if (m && byId.has(m[1])) { const p = byId.get(m[1]); out.set(p.slug, p); }
    if (line === 'src/data/events.json') {
      out.set('__events__', { slug: '__events__', title: 'Markets & events', id: 'events' });
    }
  }
  return [...out.values()];
}

async function draftStatus() {
  const exists = await branchExists(DRAFT_BRANCH);
  const onDraft = (await currentBranch()) === DRAFT_BRANCH;
  const changed = exists ? await changedProducts() : [];
  return {
    exists,
    onDraft,
    ahead: await aheadCount(),
    changed,
    live: LIVE_BRANCH,
    draft: DRAFT_BRANCH,
    pushes: !NO_PUSH,
  };
}

/* ---- app ----------------------------------------------------------- */
const app = express();
app.use(express.json({ limit: '30mb' }));

app.use('/img', express.static(IMAGES_DIR));                       // product photos for previews
app.use('/admin-tool', express.static(join(__dirname, 'public'))); // editor UI
// The built-site preview is served from the ROOT (after "Build preview") so its
// root-relative assets (/_astro, /images, ...) resolve. The editor is at
// /admin-tool. The actual dist static mount is registered last (below) so the
// /api, /img and /admin-tool routes always take precedence.
app.get('/', (_req, res, next) => {
  if (existsSync(join(DIST_DIR, 'index.html'))) return next();
  res.redirect('/admin-tool/');
});

/* ---- login -------------------------------------------------------- */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (checkPassword(String(username || ''), String(password || ''))) {
    return res.json({ token: issueToken() });
  }
  await new Promise((r) => setTimeout(r, 600));
  res.status(401).json({ error: 'Invalid username or password' });
});

/* ---- metadata ----------------------------------------------------- */
app.get('/api/meta', requireAuth, async (_req, res) => {
  let collections = [];
  try {
    for (const d of await readdir(COLLECTIONS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const idx = join(COLLECTIONS_DIR, d.name, 'index.md');
      if (existsSync(idx)) {
        const { data } = matter(await readFile(idx, 'utf8'));
        collections.push({ slug: data.slug ?? d.name, title: data.title ?? d.name });
      }
    }
  } catch { /* none */ }
  res.json({
    categories: VALID_CATEGORIES, themes: VALID_THEMES, statuses: VALID_STATUS,
    collections, live: LIVE_BRANCH, draft: DRAFT_BRANCH,
  });
});

/* ---- draft status / publish / discard ----------------------------- */
app.get('/api/draft', requireAuth, async (_req, res) => {
  res.json(await draftStatus());
});

app.post('/api/publish', requireAuth, async (_req, res) => {
  try {
    if (!(await branchExists(DRAFT_BRANCH))) {
      return res.json({ ok: true, published: false, message: 'No unpublished edits.' });
    }

    await git(['checkout', LIVE_BRANCH]);

    // Sync the local live branch with GitHub FIRST, so the push is always a
    // fast-forward and any stuck commit from a previously-failed publish is
    // cleared (its content is still safe on the draft branch, re-applied below).
    if (!NO_PUSH) {
      try {
        await git(['fetch', 'origin', LIVE_BRANCH]);
        await git(['reset', '--hard', `origin/${LIVE_BRANCH}`]);
      } catch (fetchErr) {
        return res.status(500).json({
          error: 'Publish failed',
          detail: 'Could not reach GitHub to sync. Check the internet connection, then try Commit again.\n\n' +
            String(fetchErr.stderr || fetchErr.message || fetchErr),
        });
      }
    }

    const changed = await changedProducts();
    if (changed.length === 0 && (await aheadCount()) === 0) {
      await git(['branch', '-D', DRAFT_BRANCH]);
      return res.json({ ok: true, published: false, message: 'Draft had no changes — cleared.' });
    }
    const names = changed.map((c) => c.title);
    const summary = names.length <= 5
      ? names.join(', ')
      : `${names.slice(0, 5).join(', ')} +${names.length - 5} more`;
    const msg = `Gallery update: ${summary}`;

    try {
      await git(['merge', '--squash', DRAFT_BRANCH]);
    } catch (mergeErr) {
      await git(['merge', '--abort']).catch(() => {});
      await git(['checkout', DRAFT_BRANCH]).catch(() => {});
      throw mergeErr;
    }
    // Only commit if the squash actually staged something (it won't if those
    // changes already reached the live branch).
    const staged = (await git(['diff', '--cached', '--name-only'])).trim();
    if (staged) await git(['commit', '-m', msg]);

    let pushed = false;
    if (!NO_PUSH) {
      try {
        await git(['push', 'origin', LIVE_BRANCH]);
        pushed = true;
      } catch (pushErr) {
        // Leave nothing stuck: roll the live branch back to origin and return
        // to the draft, so a retry starts from a clean slate.
        await git(['reset', '--hard', `origin/${LIVE_BRANCH}`]).catch(() => {});
        await git(['checkout', DRAFT_BRANCH]).catch(() => {});
        const d = String(pushErr.stderr || pushErr.message || pushErr);
        const friendly = /403|permission|denied|authentication|could not read|terminal prompts disabled/i.test(d)
          ? 'GitHub sign-in needed. When the GitHub sign-in window appears, sign in with the account that has access (keeleytj), then click Commit again.'
          : 'Could not push to GitHub. Your edits are safe — just try Commit again.';
        return res.status(500).json({ error: 'Publish failed', detail: friendly + '\n\n' + d });
      }
    }
    await git(['branch', '-D', DRAFT_BRANCH]);

    res.json({
      ok: true, published: true, pushed, count: changed.length,
      message: pushed
        ? `Published ${changed.length} change(s) to ${LIVE_BRANCH}. The live site rebuilds in ~1–2 minutes.`
        : `Merged ${changed.length} change(s) into ${LIVE_BRANCH} locally (push skipped).`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Publish failed', detail: String(err.stderr || err.message || err) });
  }
});

app.post('/api/discard', requireAuth, async (_req, res) => {
  try {
    if (!(await branchExists(DRAFT_BRANCH))) {
      if ((await currentBranch()) !== LIVE_BRANCH) await git(['checkout', LIVE_BRANCH]);
      return res.json({ ok: true, message: 'No draft to discard.' });
    }
    if ((await currentBranch()) === DRAFT_BRANCH) {
      await git(['reset', '--hard']);          // drop any stray uncommitted edits
      await git(['checkout', LIVE_BRANCH]);
    }
    await git(['branch', '-D', DRAFT_BRANCH]);
    res.json({ ok: true, message: 'All unpublished edits discarded.' });
  } catch (err) {
    res.status(500).json({ error: 'Discard failed', detail: String(err.stderr || err.message || err) });
  }
});

/* ---- preview build ------------------------------------------------ */
let buildState = { building: false, lastBuiltAt: null, ok: false };
app.get('/api/preview', requireAuth, (_req, res) => res.json(buildState));
app.post('/api/preview/build', requireAuth, async (_req, res) => {
  if (buildState.building) return res.status(409).json({ error: 'A build is already running.' });
  buildState.building = true;
  try {
    await execFileAsync(process.execPath, [ASTRO_BIN, 'build'], {
      cwd: ROOT, maxBuffer: 50 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' },
    });
    buildState = { building: false, lastBuiltAt: new Date().toISOString(), ok: true };
    res.json({ ok: true, url: '/', builtAt: buildState.lastBuiltAt });
  } catch (err) {
    buildState = { building: false, lastBuiltAt: buildState.lastBuiltAt, ok: false };
    res.status(500).json({ error: 'Build failed', detail: String(err.stderr || err.message || err).slice(-4000) });
  }
});

/* ---- list / get products ------------------------------------------ */
app.get('/api/products', requireAuth, async (_req, res) => {
  const items = [];
  for (const f of await listMarkdown(PRODUCTS_DIR)) {
    try {
      const { data } = matter(await readFile(join(PRODUCTS_DIR, f), 'utf8'));
      items.push({
        slug: basename(f, '.md'), id: data.id, title: data.title,
        category: data.category, status: data.status,
        hidden: data.hidden === true || data.status === 'hidden',
        featured: data.featured === true,
        mainUrl: data.images?.main ? toPreviewUrl(data.images.main) : '',
      });
    } catch { /* skip */ }
  }
  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  res.json(items);
});

app.get('/api/products/:slug', requireAuth, async (req, res) => {
  const p = await readProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({
    slug: p.slug, id: p.data.id, title: p.data.title, category: p.data.category,
    themes: p.data.themes ?? [], status: p.data.status,
    hidden: p.data.hidden === true || p.data.status === 'hidden',
    featured: p.data.featured === true,
    collection: p.data.collection ?? null,
    commission_example: !!p.data.commission_example, multi_frame: !!p.data.multi_frame,
    palette_variants: p.data.palette_variants ?? [], frame_options: p.data.frame_options ?? [],
    price: p.data.price ?? null, lead_time: p.data.lead_time ?? null,
    card_occasion: p.data.card_occasion ?? '', card_size: p.data.card_size ?? '',
    card_envelope_colour: p.data.card_envelope_colour ?? '',
    card_blank_inside: p.data.card_blank_inside ?? false,
    card_includes_envelope: p.data.card_includes_envelope ?? false,
    card_customisable: p.data.card_customisable ?? false,
    confidence: p.data.confidence ?? 'high', body: p.body.trim(), images: imagesView(p.data),
  });
});

/* ---- create new product ------------------------------------------- */
app.post('/api/products', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const title = (req.body?.title && String(req.body.title).trim()) || 'New piece';
    const id = await nextProductId();
    const slug = await uniqueSlug(slugify(title));
    const data = {
      id, title, category: 'framed', themes: ['flowers'], status: 'draft',
      hidden: true, featured: false, collection: null,
      commission_example: false, multi_frame: false,
      palette_variants: [], frame_options: [], price: null, lead_time: null,
      images: { main: '', angles: [], process: [] }, confidence: 'high',
    };
    await writeProduct(slug, data, 'Describe this piece…\n');
    await commitDraft(`Create ${title} (${id})`, [`src/content/products/${slug}.md`]);
    res.json({ ok: true, slug, id, draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- save product fields ------------------------------------------ */
app.put('/api/products/:slug', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const p = await readProduct(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};

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
    const hidden = !!b.hidden;

    // A visible piece needs a main image, or its page would be broken.
    if (!hidden && !String(p.data.images?.main || '').trim()) {
      return res.status(400).json({ error: 'Add a main image before making this piece visible.' });
    }

    const next = {
      ...p.data, title: String(b.title).trim(), category: b.category, themes, status: b.status,
      hidden, featured: !!b.featured,
      collection, commission_example: !!b.commission_example, multi_frame: !!b.multi_frame,
      palette_variants: Array.isArray(b.palette_variants) ? b.palette_variants.map(String) : [],
      frame_options: Array.isArray(b.frame_options) ? b.frame_options.map(String) : [],
      price, lead_time: leadTime,
      // Card fields (writeProduct only persists them when category === 'cards')
      card_occasion: b.card_occasion ? String(b.card_occasion).trim() : '',
      card_size: b.card_size ? String(b.card_size).trim() : '',
      card_envelope_colour: b.card_envelope_colour ? String(b.card_envelope_colour).trim() : '',
      card_blank_inside: !!b.card_blank_inside,
      card_includes_envelope: !!b.card_includes_envelope,
      card_customisable: !!b.card_customisable,
      confidence: ['high', 'medium', 'low'].includes(b.confidence) ? b.confidence : (p.data.confidence ?? 'high'),
    };
    const body = typeof b.body === 'string' ? b.body.trim() + '\n' : p.body;
    await writeProduct(req.params.slug, next, body);
    await commitDraft(`Edit ${next.title} (${next.id})`, [`src/content/products/${req.params.slug}.md`]);
    res.json({ ok: true, draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- add image ---------------------------------------------------- */
app.post('/api/products/:slug/images', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const p = await readProduct(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const { role, filename, dataBase64 } = req.body || {};
    if (!['main', 'angles', 'process'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (!dataBase64) return res.status(400).json({ error: 'No image data' });

    let ext = extname(String(filename || '')).toLowerCase();
    if (!/^\.(jpe?g|png|webp|avif|gif)$/.test(ext)) ext = '.jpg';

    const id = p.data.id;
    await mkdir(join(IMAGES_DIR, id), { recursive: true });
    const name = role === 'main' ? `main${ext}` : await nextImageName(id, role, ext);
    const buf = Buffer.from(String(dataBase64).replace(/^data:[^,]+,/, ''), 'base64');
    await writeFile(join(IMAGES_DIR, id, name), buf);

    const fmPath = `${FM_PREFIX}${id}/${name}`;
    if (role === 'main') p.data.images.main = fmPath;
    else p.data.images[role] = [...(p.data.images[role] ?? []), fmPath];

    await writeProduct(req.params.slug, p.data, p.body);
    await commitDraft(`Add ${role} image to ${p.data.title} (${id})`,
      [`src/content/products/${req.params.slug}.md`, `images/${id}`]);
    res.json({ ok: true, images: imagesView(p.data), draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- delete image ------------------------------------------------- */
app.delete('/api/products/:slug/images', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const p = await readProduct(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const { role, path } = req.body || {};
    if (role === 'main') return res.status(400).json({ error: 'Main image is required — replace it instead of deleting.' });
    if (!['angles', 'process'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const list = p.data.images[role] ?? [];
    if (!list.includes(path)) return res.status(404).json({ error: 'Image not found on this product' });
    p.data.images[role] = list.filter((x) => x !== path);

    // Don't hard-delete — move the file out to the images/ root so it can be
    // managed (or permanently removed) by hand later.
    const m = String(path).match(/images\/([^/]+)\/(.+)$/);
    if (m) {
      const srcFile = join(IMAGES_DIR, m[1], m[2]);
      if (existsSync(srcFile)) {
        const dot = m[2].lastIndexOf('.');
        const stem = dot >= 0 ? m[2].slice(0, dot) : m[2];
        const ext = dot >= 0 ? m[2].slice(dot) : '';
        let dest = join(IMAGES_DIR, `${m[1]}-${stem}${ext}`);
        let n = 2;
        while (existsSync(dest)) dest = join(IMAGES_DIR, `${m[1]}-${stem}-${n++}${ext}`);
        await copyFile(srcFile, dest);
        await unlink(srcFile).catch(() => {});
      }
    }

    await writeProduct(req.params.slug, p.data, p.body);
    await commitDraft(`Remove ${role} image from ${p.data.title} (${p.data.id})`,
      [`src/content/products/${req.params.slug}.md`, `images/${p.data.id}`]);
    res.json({ ok: true, images: imagesView(p.data), draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- promote an existing image to be the main image (swap) -------- */
app.post('/api/products/:slug/main-image', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const p = await readProduct(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const { path } = req.body || {};
    if (!path) return res.status(400).json({ error: 'No image specified' });

    const cur = p.data.images;
    if (cur.main === path) return res.json({ ok: true, images: imagesView(p.data) }); // already main
    const oldMain = String(cur.main || '').trim();

    if ((cur.angles ?? []).includes(path)) {
      // True swap: the angle and the main exchange places.
      const idx = cur.angles.indexOf(path);
      cur.main = path;
      if (oldMain) cur.angles[idx] = oldMain;
      else cur.angles.splice(idx, 1);
    } else if ((cur.process ?? []).includes(path)) {
      cur.process = cur.process.filter((x) => x !== path);
      cur.main = path;
      if (oldMain) cur.angles = [oldMain, ...(cur.angles ?? [])];
    } else {
      return res.status(404).json({ error: 'Image not found on this product' });
    }

    await writeProduct(req.params.slug, p.data, p.body);
    await commitDraft(`Set main image for ${p.data.title} (${p.data.id})`,
      [`src/content/products/${req.params.slug}.md`, `images/${p.data.id}`]);
    res.json({ ok: true, images: imagesView(p.data), draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- move an angle image to a different product ------------------- */
app.post('/api/products/:slug/move-angle', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const from = await readProduct(req.params.slug);
    if (!from) return res.status(404).json({ error: 'Source item not found' });
    const { path, toSlug } = req.body || {};
    if (!toSlug || toSlug === req.params.slug) return res.status(400).json({ error: 'Pick a different item' });
    const to = await readProduct(toSlug);
    if (!to) return res.status(404).json({ error: 'Target item not found' });
    if (!(from.data.images.angles ?? []).includes(path)) {
      return res.status(404).json({ error: 'That image is not an angle on this item' });
    }

    const m = String(path).match(/images\/([^/]+)\/(.+)$/);
    if (!m) return res.status(400).json({ error: 'Bad image path' });
    const srcFile = join(IMAGES_DIR, m[1], m[2]);
    if (!existsSync(srcFile)) return res.status(404).json({ error: 'Source image file is missing' });

    const toId = to.data.id;
    let ext = extname(m[2]).toLowerCase();
    if (!/^\.(jpe?g|png|webp|avif|gif)$/.test(ext)) ext = '.jpg';
    await mkdir(join(IMAGES_DIR, toId), { recursive: true });
    const newName = await nextImageName(toId, 'angles', ext);
    await copyFile(srcFile, join(IMAGES_DIR, toId, newName));
    await unlink(srcFile).catch(() => {});

    from.data.images.angles = from.data.images.angles.filter((x) => x !== path);
    to.data.images.angles = [...(to.data.images.angles ?? []), `${FM_PREFIX}${toId}/${newName}`];

    await writeProduct(req.params.slug, from.data, from.body);
    await writeProduct(toSlug, to.data, to.body);
    await commitDraft(`Move angle image from ${from.data.title} to ${to.data.title}`,
      [`src/content/products/${req.params.slug}.md`, `src/content/products/${toSlug}.md`,
       `images/${from.data.id}`, `images/${toId}`]);
    res.json({ ok: true, images: imagesView(from.data), toTitle: to.data.title, draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- reorder angle / process images ------------------------------- */
app.post('/api/products/:slug/reorder-images', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const p = await readProduct(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const { role, order } = req.body || {};
    if (!['angles', 'process'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Bad order' });
    const cur = p.data.images[role] ?? [];
    // order must be a permutation of the current images (same set, no dupes)
    if (order.length !== cur.length || new Set(order).size !== order.length || !order.every((x) => cur.includes(x))) {
      return res.status(400).json({ error: 'Order does not match the current images' });
    }
    p.data.images[role] = order;
    await writeProduct(req.params.slug, p.data, p.body);
    await commitDraft(`Reorder ${role} images for ${p.data.title} (${p.data.id})`,
      [`src/content/products/${req.params.slug}.md`]);
    res.json({ ok: true, images: imagesView(p.data), draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- events: helpers ---------------------------------------------- */
async function readEvents() {
  if (!existsSync(EVENTS_PATH)) return [];
  try { return JSON.parse(await readFile(EVENTS_PATH, 'utf8')); } catch { return []; }
}
async function writeEvents(arr) {
  await writeFile(EVENTS_PATH, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

/* ---- events: list / create / update ------------------------------- */
app.get('/api/events', requireAuth, async (_req, res) => {
  res.json(await readEvents());
});

app.post('/api/events', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const evs = await readEvents();
    let max = 0;
    for (const e of evs) { const n = parseInt(e.id, 10); if (!Number.isNaN(n) && n > max) max = n; }
    const id = String(max + 1).padStart(3, '0');
    const name = (req.body?.name && String(req.body.name).trim()) || 'New event';
    const ev = { id, name, date: '', venue: '', stallNumber: '', url: '', status: 'tentative', hidden: true, description: '' };
    evs.push(ev);
    await writeEvents(evs);
    await commitDraft(`Create event ${name}`, ['src/data/events.json']);
    res.json({ ok: true, event: ev, draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.put('/api/events/:id', requireAuth, async (req, res) => {
  try {
    await ensureDraft();
    const evs = await readEvents();
    const i = evs.findIndex((e) => e.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'Event not found' });
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Event name is required' });
    const status = ['confirmed', 'tentative', 'cancelled'].includes(b.status) ? b.status : 'confirmed';
    const date = b.date ? String(b.date).trim() : '';
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    const hidden = !!b.hidden;
    if (!hidden && !date) return res.status(400).json({ error: 'Add a date before making the event visible.' });
    const ev = {
      id: evs[i].id,
      name: String(b.name).trim(),
      date,
      venue: b.venue ? String(b.venue).trim() : '',
      stallNumber: b.stallNumber ? String(b.stallNumber).trim() : '',
      url: b.url ? String(b.url).trim() : '',
      status,
      hidden,
      description: b.description ? String(b.description).trim() : '',
    };
    evs[i] = ev;
    await writeEvents(evs);
    await commitDraft(`Edit event ${ev.name}`, ['src/data/events.json']);
    res.json({ ok: true, event: ev, draft: await draftStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/* ---- built-site preview (root) — registered LAST as a catch-all --- */
app.use(express.static(DIST_DIR));

/* ---- startup: resume an existing draft ---------------------------- */
async function reconcileBranch() {
  try {
    if ((await branchExists(DRAFT_BRANCH)) && (await currentBranch()) !== DRAFT_BRANCH && (await treeCleanTracked())) {
      await git(['checkout', DRAFT_BRANCH]);
      console.log(`  Resumed unpublished edits on "${DRAFT_BRANCH}".`);
    }
  } catch { /* best effort */ }
}

/* ---- start (with port fallback) ----------------------------------- */
function start(port) {
  const server = app.listen(port, '127.0.0.1', async () => {
    await reconcileBranch();
    console.log(`\n  Gallery admin running →  http://localhost:${port}/admin-tool/`);
    console.log(`  live: ${LIVE_BRANCH}   draft: ${DRAFT_BRANCH}${NO_PUSH ? '   (push disabled)' : ''}`);
    console.log(`  (local only — press Ctrl+C to stop)\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port === PORT) {
      console.warn(`  Port ${PORT} busy, trying ${PORT_FALLBACK}…`);
      start(PORT_FALLBACK);
    } else { console.error(err); process.exit(1); }
  });
}
start(PORT);

'use strict';

const LIVE_BASE = 'https://quillartbytk.com';
const $ = (sel) => document.querySelector(sel);

let token = sessionStorage.getItem('admin_token') || '';
let meta = null;
let products = [];
let current = null;
let chips = { palette: [], frames: [] };
let dragData = null; // active image drag payload (dataTransfer is unreadable during dragover)

/* ---------------- API helper ---------------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // A 401 on a normal request means the session lapsed. A 401 on the login
  // request itself means the credentials were wrong — show the real message.
  if (res.status === 401 && path !== '/api/login') {
    logout();
    throw new Error('Session expired — please sign in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------- Auth ---------------- */
function showLogin() { $('#login-view').hidden = false; $('#app-view').hidden = true; }
function showApp() { $('#login-view').hidden = true; $('#app-view').hidden = false; }
function logout() { token = ''; sessionStorage.removeItem('admin_token'); showLogin(); }

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: { username: $('#login-user').value, password: $('#login-pass').value },
    });
    token = data.token;
    sessionStorage.setItem('admin_token', token);
    $('#login-pass').value = '';
    await boot();
  } catch (e2) { err.textContent = e2.message; err.hidden = false; }
});
$('#logout-btn').addEventListener('click', logout);

/* ---------------- Zeller POS Lite CSV export ---------------- */
$('#zeller-csv-btn').addEventListener('click', async () => {
  const btn = $('#zeller-csv-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const res = await fetch('/api/zeller-csv', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (!res.ok) throw new Error('Export failed (' + res.status + ')');
    const blob = await res.blob();
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = 'zeller-pos-items.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(dlUrl);
  } catch (e) {
    alert('Could not export Zeller CSV: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

/* ---------------- Boot ---------------- */
async function boot() {
  showApp();
  meta = await api('/api/meta');
  $('#branch-badge').textContent = 'editing: ' + meta.draft;
  buildStatusSelect();
  buildCollectionSelect();
  buildFilters();
  buildColFilters();
  await loadProductList();
  await refreshDraft();
  await refreshSyncStatus();
}
/* Shared product filtering — the Gallery tab and the Collections pool use the
   SAME predicate and the SAME option set, so they behave identically and any
   future filter change applies to both. */
function fillProductFilterSelects(catSel, themeSel, statusSel) {
  catSel.innerHTML =
    '<option value="">All categories</option>' + meta.categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  themeSel.innerHTML =
    '<option value="">All themes</option>' + meta.themes.map((t) => `<option value="${t}">${t}</option>`).join('');
  statusSel.innerHTML =
    '<option value="">All statuses</option>' + meta.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
}
function filterProducts(list, { q, cat, theme, status, vis }) {
  if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.includes(q));
  if (cat) list = list.filter((p) => p.category === cat);
  if (theme) list = list.filter((p) => (p.themes || []).includes(theme));
  if (status) list = list.filter((p) => p.status === status);
  if (vis === 'visible') list = list.filter((p) => !p.hidden);
  else if (vis === 'hidden') list = list.filter((p) => p.hidden);
  return list;
}
function buildFilters() {
  fillProductFilterSelects($('#filter-category'), $('#filter-theme'), $('#filter-status'));
  ['#filter-category', '#filter-theme', '#filter-status', '#filter-visibility'].forEach((sel) =>
    $(sel).addEventListener('change', applyFilters));
}
function applyFilters() {
  const crit = {
    q: $('#search').value.toLowerCase().trim(),
    cat: $('#filter-category').value,
    theme: $('#filter-theme').value,
    status: $('#filter-status').value,
    vis: $('#filter-visibility').value,
  };
  const list = filterProducts(products, crit);
  renderProductList(list);
  const active = !!(crit.q || crit.cat || crit.theme || crit.status || crit.vis);
  $('#filter-clear').hidden = !active;
  $('#filter-count').textContent = active ? `Showing ${list.length} of ${products.length}` : '';
}
function buildStatusSelect() {
  $('#f-status').innerHTML = meta.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
}
function buildCollectionSelect() {
  $('#f-collection').innerHTML = ['<option value="">(none)</option>']
    .concat(meta.collections.map((c) => `<option value="${c.slug}">${c.title}</option>`)).join('');
}

/* ---------------- Draft bar ---------------- */
function renderDraft(d) {
  const dot = $('#draft-dot');
  const summary = $('#draft-summary');
  const commit = $('#commit-btn');
  const discard = $('#discard-btn');
  const pending = d && d.changed && d.changed.length > 0;

  if (pending) {
    const names = d.changed.map((c) => c.title);
    const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4} more` : '');
    summary.innerHTML = `<strong>${names.length}</strong> unpublished edit${names.length === 1 ? '' : 's'}: <span class="muted">${escapeHtml(shown)}</span>`;
    dot.className = 'draft-dot pending';
    commit.disabled = false;
    discard.disabled = false;
    commit.textContent = `Commit ${names.length} change${names.length === 1 ? '' : 's'} (publish live)`;
  } else {
    summary.innerHTML = `No unpublished edits — in sync with live.`;
    dot.className = 'draft-dot clean';
    commit.disabled = true;
    discard.disabled = true;
    commit.textContent = 'Commit (publish live)';
  }
}
async function refreshDraft() {
  try { renderDraft(await api('/api/draft')); } catch { /* ignore */ }
}

/* preview */
$('#preview-btn').addEventListener('click', async () => {
  const btn = $('#preview-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Building… (~10s)';
  try {
    await api('/api/preview/build', { method: 'POST' });
    $('#preview-link').hidden = false;
    btn.textContent = 'Rebuild preview';
    window.open('/', '_blank', 'noopener');
  } catch (e) {
    alert('Build failed:\n\n' + e.message);
    btn.textContent = original;
  } finally {
    btn.disabled = false;
  }
});

/* commit */
$('#commit-btn').addEventListener('click', async () => {
  const d = await api('/api/draft').catch(() => null);
  const n = d && d.changed ? d.changed.length : 0;
  if (!n) return;
  if (!confirm(`Publish ${n} change${n === 1 ? '' : 's'} to the LIVE site?\n\nThis pushes to ${meta.draft === 'gallery-edits' ? 'the live branch' : meta.live} and the site rebuilds in a minute or two.`)) return;
  const btn = $('#commit-btn');
  btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const r = await api('/api/publish', { method: 'POST' });
    alert(r.message);
    current = null;
    $('#editor-form').hidden = true;
    $('#empty-state').hidden = false;
    await loadProductList();
    await resetEventsView();
    await resetCollectionsView();
    await refreshDraft();
    await refreshSyncStatus();
  } catch (e) {
    alert('Publish failed:\n\n' + e.message);
  } finally {
    btn.disabled = false;
  }
});

/* discard */
$('#discard-btn').addEventListener('click', async () => {
  const d = await api('/api/draft').catch(() => null);
  const n = d && d.changed ? d.changed.length : 0;
  if (!n) return;
  if (!confirm(`Discard ALL ${n} unpublished edit${n === 1 ? '' : 's'}?\n\nThis permanently deletes your draft and cannot be undone.`)) return;
  const btn = $('#discard-btn');
  btn.disabled = true; btn.textContent = 'Discarding…';
  try {
    const r = await api('/api/discard', { method: 'POST' });
    current = null;
    $('#editor-form').hidden = true;
    $('#empty-state').hidden = false;
    await loadProductList();
    await resetEventsView();
    await resetCollectionsView();
    await refreshDraft();
  } catch (e) {
    alert('Discard failed:\n\n' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Discard';
  }
});

/* sync from live (pull origin/main onto this computer) */
async function refreshSyncStatus() {
  const btn = $('#sync-btn');
  if (!btn || btn.dataset.busy === '1') return;
  try {
    const s = await api('/api/sync-status');
    if (s.canSync) {
      btn.disabled = false;
      btn.textContent = `↓ Sync from live (${s.behind} new)`;
      btn.title = `${s.behind} new published change${s.behind === 1 ? '' : 's'} available — click to update this computer.` +
        (s.draftPending ? ' (Publish or discard your edits first.)' : '');
    } else {
      btn.disabled = true;
      btn.textContent = '↓ Up to date';
      btn.title = s.reason === 'push-disabled'
        ? 'Sync is disabled.'
        : 'This computer already has the latest published changes.';
    }
  } catch {
    btn.disabled = true;
    btn.textContent = '↓ Up to date';
  }
}

$('#sync-btn').addEventListener('click', async () => {
  const btn = $('#sync-btn');
  btn.dataset.busy = '1';
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Syncing…';
  try {
    const r = await api('/api/sync', { method: 'POST' });
    if (r.synced > 0) {
      current = null;
      $('#editor-form').hidden = true;
      $('#empty-state').hidden = false;
      await loadProductList();
      if (events !== null) await loadEventList();
      await resetCollectionsView();
      await refreshDraft();
      alert(
        r.message + '\n\n' +
        '⚠ Important — restart the admin tool now so any updates to the editor itself take effect:\n\n' +
        '  1. Click the terminal window and press Ctrl + C to stop it.\n' +
        '  2. Type  npm run admin  and press Enter.\n' +
        '  3. Refresh this page.'
      );
    }
  } catch (e) {
    alert('Sync failed:\n\n' + e.message);
  } finally {
    btn.dataset.busy = '';
    btn.textContent = label;
    await refreshSyncStatus();
  }
});

setInterval(refreshSyncStatus, 120000);

/* ---------------- Product list ---------------- */
async function loadProductList() {
  products = await api('/api/products');
  applyFilters();
}
function renderProductList(list) {
  const wrap = $('#product-list');
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<p class="filter-count" style="padding:1rem 0.9rem;">No items match.</p>';
    return;
  }
  list.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'product-item' + (current && current.slug === p.slug ? ' active' : '') + (p.hidden ? ' is-hidden' : '');
    btn.dataset.slug = p.slug;
    const thumb = p.mainUrl ? `<img src="${p.mainUrl}" alt="" loading="lazy" />` : `<span class="pi-noimg">＋</span>`;
    const tags = `${p.hidden ? '<span class="pi-tag hidden">hidden</span>' : ''}${p.featured ? '<span class="pi-tag featured">★ featured</span>' : ''}`;
    btn.innerHTML = `
      ${thumb}
      <span>
        <span class="pi-title">${escapeHtml(p.title)}<span class="pi-tags">${tags}</span></span><br/>
        <span class="pi-meta"><span class="status-dot s-${p.status}"></span>${p.id} · ${p.category}</span>
      </span>`;
    btn.addEventListener('click', () => selectProduct(p.slug));
    // Drop target: move an angle image from another item onto this one.
    btn.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; btn.classList.add('drop-target'); });
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-target'));
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drop-target');
      const d = parseDrag(e);
      if (!d || !d.path) return;
      if (d.role !== 'angles') { setStatus('Only angle images can be moved between items.', 'err'); return; }
      if (d.fromSlug === p.slug) return;
      moveAngleToItem(d.fromSlug, d.path, p.slug, p.title);
    });
    wrap.appendChild(btn);
  });
}
$('#search').addEventListener('input', applyFilters);

$('#filter-clear').addEventListener('click', () => {
  $('#search').value = '';
  $('#filter-category').value = '';
  $('#filter-theme').value = '';
  $('#filter-status').value = '';
  $('#filter-visibility').value = '';
  applyFilters();
});

$('#new-item-btn').addEventListener('click', async () => {
  const title = prompt('Title for the new piece? (you can change it later)');
  if (title === null) return;
  try {
    const r = await api('/api/products', { method: 'POST', body: { title: title.trim() } });
    await loadProductList();
    if (r.draft) renderDraft(r.draft);
    await selectProduct(r.slug);
    setStatus(`Created ${r.id} (hidden). Add a main image and details, then set Visible.`, 'ok');
  } catch (e) {
    alert('Could not create item:\n\n' + e.message);
  }
});

/* ---------------- Editor ---------------- */
async function selectProduct(slug) {
  current = await api('/api/products/' + slug);
  $('#empty-state').hidden = true;
  $('#editor-form').hidden = false;
  document.querySelectorAll('.product-item').forEach((el) =>
    el.classList.toggle('active', el.dataset.slug === slug));

  $('#editor-title').textContent = current.title;
  $('#editor-id').textContent = current.id;
  $('#view-live').href = `${LIVE_BASE}/products/${slug}`;

  $('#f-title').value = current.title;
  $('#f-body').value = current.body || '';
  $('#f-status').value = current.status;
  $('#f-price').value = current.price ?? '';
  $('#f-sale-price').value = current.sale_price ?? '';
  $('#f-lead').value = current.lead_time ?? '';
  $('#f-collection').value = current.collection ?? '';
  $('#f-commission').checked = current.commission_example;
  $('#f-multiframe').checked = current.multi_frame;
  $('#f-featured').checked = current.featured;
  setVisibility(current.hidden);

  // Card fields
  $('#f-card-occasion').value = current.card_occasion || '';
  $('#f-card-size').value = current.card_size || '';
  $('#f-card-envelope').value = current.card_envelope_colour || '';
  $('#f-card-blank').checked = !!current.card_blank_inside;
  $('#f-card-envelope-inc').checked = !!current.card_includes_envelope;
  $('#f-card-customisable').checked = !!current.card_customisable;
  updateCardSection(current.category);

  renderCategory(current.category);
  renderThemes(current.themes);
  chips.palette = [...current.palette_variants];
  chips.frames = [...current.frame_options];
  renderChips('palette');
  renderChips('frames');
  renderImages(current.images);
  setStatus('', '');
}

function renderCategory(selected) {
  $('#f-category').innerHTML = meta.categories.map((c) => `
    <label class="pill ${c === selected ? 'checked' : ''}">
      <input type="radio" name="category" value="${c}" ${c === selected ? 'checked' : ''} hidden/> ${c}
    </label>`).join('');
  $('#f-category').querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('change', () => {
      $('#f-category').querySelectorAll('.pill').forEach((pl) =>
        pl.classList.toggle('checked', pl.querySelector('input').checked));
      updateCardSection(($('#f-category').querySelector('input:checked') || {}).value);
    });
  });
}
function selectedCategory() {
  return ($('#f-category').querySelector('input:checked') || {}).value;
}
function updateCardSection(category) {
  $('#card-section').hidden = category !== 'cards';
}
function setVisibility(hidden) {
  const val = hidden ? 'hidden' : 'visible';
  $('#f-visibility').querySelectorAll('input').forEach((i) => {
    i.checked = i.value === val;
    i.closest('.pill').classList.toggle('checked', i.checked);
  });
}
function isHiddenSelected() {
  return (($('#f-visibility').querySelector('input:checked') || {}).value) === 'hidden';
}
// One-time: visibility pills reflect selection
$('#f-visibility').querySelectorAll('input').forEach((inp) => {
  inp.addEventListener('change', () => {
    $('#f-visibility').querySelectorAll('.pill').forEach((pl) =>
      pl.classList.toggle('checked', pl.querySelector('input').checked));
  });
});
function renderThemes(selected) {
  const set = new Set(selected);
  $('#f-themes').innerHTML = meta.themes.map((t) => `
    <label class="pill ${set.has(t) ? 'checked' : ''}">
      <input type="checkbox" value="${t}" ${set.has(t) ? 'checked' : ''} hidden/> ${t}
    </label>`).join('');
  $('#f-themes').querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('change', () => inp.closest('.pill').classList.toggle('checked', inp.checked));
  });
}

/* ---------------- Chips ---------------- */
function renderChips(field) {
  const el = field === 'palette' ? $('#f-palette') : $('#f-frames');
  el.querySelectorAll('.chip').forEach((c) => c.remove());
  let input = el.querySelector('input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'type + Enter';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value.trim();
        if (v && !chips[field].includes(v)) { chips[field].push(v); renderChips(field); }
        input.value = '';
      }
    });
    el.appendChild(input);
  }
  chips[field].forEach((val) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${escapeHtml(val)} <button type="button" aria-label="remove">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      chips[field] = chips[field].filter((x) => x !== val);
      renderChips(field);
    });
    el.insertBefore(chip, input);
  });
}

/* ---------------- Images ---------------- */
function renderImages(images) {
  const hasMain = images.main && images.main.path;
  renderImgGrid($('#img-main'), hasMain ? [images.main] : [], 'main');
  renderImgGrid($('#img-angles'), images.angles, 'angles');
  renderImgGrid($('#img-process'), images.process, 'process');
}
function renderImgGrid(el, items, role) {
  el.innerHTML = '';
  items.forEach((img) => {
    const card = document.createElement('div');
    card.className = 'img-card' + (role === 'main' ? ' is-main' : '');
    if (role === 'main') {
      card.innerHTML = `<img src="${img.url}?t=${Date.now()}" alt="" /><span class="main-tag">main</span>`;
    } else {
      card.draggable = true;
      card.innerHTML =
        `<img src="${img.url}?t=${Date.now()}" alt="" />` +
        `<button class="mkmain" title="Make this the main image" type="button">★</button>` +
        `<button class="del" title="Delete" type="button">×</button>`;
      card.querySelector('.del').addEventListener('click', () => deleteImage(role, img.path));
      card.querySelector('.mkmain').addEventListener('click', () => setMainImage(img.path));
      card.addEventListener('dragstart', (ev) => {
        dragData = { path: img.path, role, fromSlug: current.slug };
        ev.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        ev.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => { dragData = null; card.classList.remove('reorder-over'); });
      // Drop onto another thumbnail in the same grid to resequence.
      card.addEventListener('dragover', (e) => {
        const d = dragData;
        if (d && d.role === role && d.fromSlug === current.slug && d.path !== img.path) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('reorder-over');
        }
      });
      card.addEventListener('dragleave', () => card.classList.remove('reorder-over'));
      card.addEventListener('drop', (e) => {
        card.classList.remove('reorder-over');
        const d = dragData || parseDrag(e);
        if (!d || d.role !== role || d.fromSlug !== current.slug || d.path === img.path) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = card.getBoundingClientRect();
        const after = (e.clientX - rect.left) > rect.width / 2;
        const order = buildReorder(role, d.path, img.path, after);
        if (order) reorderImages(role, order);
      });
    }
    el.appendChild(card);
  });
}

function buildReorder(role, draggedPath, targetPath, after) {
  const order = current.images[role].map((i) => i.path);
  const from = order.indexOf(draggedPath);
  if (from < 0) return null;
  order.splice(from, 1);
  let to = order.indexOf(targetPath);
  if (to < 0) return null;
  if (after) to++;
  order.splice(to, 0, draggedPath);
  return order;
}
async function reorderImages(role, order) {
  if (!current) return;
  setStatus('Reordering…', 'busy');
  try {
    const data = await api(`/api/products/${current.slug}/reorder-images`, { method: 'POST', body: { role, order } });
    current.images = data.images;
    renderImages(data.images);
    if (data.draft) renderDraft(data.draft);
    setStatus('Order updated.', 'ok');
  } catch (e) { setStatus(e.message, 'err'); }
}

async function setMainImage(path) {
  if (!current) return;
  setStatus('Updating main image…', 'busy');
  try {
    const data = await api(`/api/products/${current.slug}/main-image`, { method: 'POST', body: { path } });
    current.images = data.images;
    renderImages(data.images);
    if (data.draft) renderDraft(data.draft);
    setStatus('Main image updated.', 'ok');
  } catch (e) { setStatus(e.message, 'err'); }
}

function parseDrag(e) {
  try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; }
}

// Main image slot is a drop target — drop an angle/process thumb onto it.
(function setupMainDropZone() {
  const z = $('#img-main');
  z.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; z.classList.add('drop-hover'); });
  z.addEventListener('dragleave', () => z.classList.remove('drop-hover'));
  z.addEventListener('drop', (e) => {
    e.preventDefault();
    z.classList.remove('drop-hover');
    const d = parseDrag(e);
    if (d && d.path) setMainImage(d.path);
  });
})();

// Move an angle image onto a different item in the list.
async function moveAngleToItem(fromSlug, path, toSlug, toTitle) {
  if (!confirm(`Move this angle image to “${toTitle}”?\n\nIt will be added there and removed from the current item.`)) return;
  setStatus('Moving image…', 'busy');
  try {
    const data = await api(`/api/products/${fromSlug}/move-angle`, { method: 'POST', body: { path, toSlug } });
    if (current && current.slug === fromSlug) { current.images = data.images; renderImages(data.images); }
    if (data.draft) renderDraft(data.draft);
    await loadProductList();
    setStatus(`Moved to “${toTitle}”.`, 'ok');
  } catch (e) { setStatus(e.message, 'err'); }
}

document.querySelectorAll('input[type="file"]').forEach((inp) => {
  inp.addEventListener('change', async () => {
    if (!inp.files || !inp.files[0] || !current) return;
    const file = inp.files[0];
    setStatus('Uploading image…', 'busy');
    try {
      const dataBase64 = await fileToBase64(file);
      const data = await api(`/api/products/${current.slug}/images`, {
        method: 'POST', body: { role: inp.dataset.role, filename: file.name, dataBase64 },
      });
      current.images = data.images;
      renderImages(data.images);
      if (data.draft) renderDraft(data.draft);
      setStatus('Image added to draft.', 'ok');
    } catch (e) { setStatus(e.message, 'err'); }
    inp.value = '';
  });
});
async function deleteImage(role, path) {
  if (!confirm('Remove this image from this item?\n\nThe file is moved to the images/ folder (not deleted) so you can manage it yourself.')) return;
  setStatus('Removing image…', 'busy');
  try {
    const data = await api(`/api/products/${current.slug}/images`, { method: 'DELETE', body: { role, path } });
    current.images = data.images;
    renderImages(data.images);
    if (data.draft) renderDraft(data.draft);
    setStatus('Removed — file moved to the images/ folder.', 'ok');
  } catch (e) { setStatus(e.message, 'err'); }
}

/* ---------------- Save to draft ---------------- */
$('#editor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const btn = $('#save-btn');
  btn.disabled = true;

  const themes = [...$('#f-themes').querySelectorAll('input:checked')].map((i) => i.value);
  const category = ($('#f-category').querySelector('input:checked') || {}).value;
  if (!themes.length) { setStatus('Pick at least one theme.', 'err'); btn.disabled = false; return; }
  if (!category) { setStatus('Pick a category.', 'err'); btn.disabled = false; return; }

  const payload = {
    title: $('#f-title').value,
    body: $('#f-body').value,
    category, themes,
    status: $('#f-status').value,
    hidden: isHiddenSelected(),
    featured: $('#f-featured').checked,
    price: $('#f-price').value === '' ? null : Number($('#f-price').value),
    sale_price: $('#f-sale-price').value === '' ? null : Number($('#f-sale-price').value),
    lead_time: $('#f-lead').value,
    collection: $('#f-collection').value,
    commission_example: $('#f-commission').checked,
    multi_frame: $('#f-multiframe').checked,
    palette_variants: chips.palette,
    frame_options: chips.frames,
    card_occasion: $('#f-card-occasion').value,
    card_size: $('#f-card-size').value,
    card_envelope_colour: $('#f-card-envelope').value,
    card_blank_inside: $('#f-card-blank').checked,
    card_includes_envelope: $('#f-card-envelope-inc').checked,
    card_customisable: $('#f-card-customisable').checked,
    confidence: current.confidence,
  };
  try {
    setStatus('Saving to draft…', 'busy');
    const r = await api('/api/products/' + current.slug, { method: 'PUT', body: payload });
    current.title = payload.title;
    $('#editor-title').textContent = payload.title;
    await loadProductList();
    if (r.draft) renderDraft(r.draft); else await refreshDraft();
    setStatus('Saved to draft.', 'ok');
  } catch (e2) {
    setStatus(e2.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- helpers ---------------- */
function setStatus(msg, kind) {
  const el = $('#save-status');
  el.textContent = msg;
  el.className = 'save-status ' + (kind || '');
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= Tabs ================= */
function showTab(name) {
  $('#gallery-tab').hidden = name !== 'gallery';
  $('#collections-tab').hidden = name !== 'collections';
  $('#events-tab').hidden = name !== 'events';
  $('#orders-tab').hidden = name !== 'orders';
  $('#tab-gallery').classList.toggle('active', name === 'gallery');
  $('#tab-collections').classList.toggle('active', name === 'collections');
  $('#tab-events').classList.toggle('active', name === 'events');
  $('#tab-orders').classList.toggle('active', name === 'orders');
  if (name === 'collections') {
    if (collections === null) loadCollectionList();
    else { renderCollectionList(); if (currentCollection) renderColWorkspace(); }
  }
  if (name === 'events' && events === null) loadEventList();
  if (name === 'orders') loadOrders();
}
$('#tab-gallery').addEventListener('click', () => showTab('gallery'));
$('#tab-collections').addEventListener('click', () => showTab('collections'));
$('#tab-events').addEventListener('click', () => showTab('events'));
$('#tab-orders').addEventListener('click', () => showTab('orders'));

/* ================= Events editor ================= */
let events = null;
let currentEvent = null;

async function loadEventList() {
  events = await api('/api/events');
  renderEventList();
}
async function resetEventsView() {
  currentEvent = null;
  $('#event-form').hidden = true;
  $('#ev-empty-state').hidden = false;
  if (events !== null) await loadEventList(); // reflect reverted/published state
}
function renderEventList() {
  const wrap = $('#event-list');
  wrap.innerHTML = '';
  const q = $('#ev-search').value.toLowerCase().trim();
  const list = [...(events || [])]
    .filter((ev) => !q || (ev.name || '').toLowerCase().includes(q) || (ev.venue || '').toLowerCase().includes(q))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  list.forEach((ev) => {
    const btn = document.createElement('button');
    btn.className = 'product-item' + (currentEvent && currentEvent.id === ev.id ? ' active' : '') + (ev.hidden ? ' is-hidden' : '');
    btn.innerHTML = `
      <span>
        <span class="pi-title">${escapeHtml(ev.name)}${ev.hidden ? ' <span class="pi-tag hidden">hidden</span>' : ''}</span><br/>
        <span class="pi-meta">${ev.date ? (ev.endDate ? ev.date + ' – ' + ev.endDate : ev.date) : '— no date'} · ${ev.status || ''}</span>
      </span>`;
    btn.addEventListener('click', () => selectEvent(ev.id));
    wrap.appendChild(btn);
  });
}
$('#ev-search').addEventListener('input', renderEventList);

function selectEvent(id) {
  currentEvent = (events || []).find((e) => e.id === id);
  if (!currentEvent) return;
  $('#ev-empty-state').hidden = true;
  $('#event-form').hidden = false;
  renderEventList();
  $('#ev-title').textContent = currentEvent.name;
  $('#ev-id').textContent = '#' + currentEvent.id;
  $('#ev-name').value = currentEvent.name || '';
  $('#ev-date').value = currentEvent.date || '';
  $('#ev-end-date').value = currentEvent.endDate || '';
  $('#ev-venue').value = currentEvent.venue || '';
  $('#ev-stall').value = currentEvent.stallNumber || '';
  $('#ev-url').value = currentEvent.url || '';
  $('#ev-status').value = currentEvent.status || 'confirmed';
  $('#ev-desc').value = currentEvent.description || '';
  setEvVisibility(!!currentEvent.hidden);
  setEvStatus('', '');
}

function setEvStatus(msg, kind) {
  const el = $('#ev-save-status');
  el.textContent = msg;
  el.className = 'save-status ' + (kind || '');
}
function setEvVisibility(hidden) {
  const val = hidden ? 'hidden' : 'visible';
  $('#ev-visibility').querySelectorAll('input').forEach((i) => {
    i.checked = i.value === val;
    i.closest('.pill').classList.toggle('checked', i.checked);
  });
}
function isEvHidden() {
  return (($('#ev-visibility').querySelector('input:checked') || {}).value) === 'hidden';
}
$('#ev-visibility').querySelectorAll('input').forEach((inp) => {
  inp.addEventListener('change', () => {
    $('#ev-visibility').querySelectorAll('.pill').forEach((pl) =>
      pl.classList.toggle('checked', pl.querySelector('input').checked));
  });
});

$('#ev-new-btn').addEventListener('click', async () => {
  const name = prompt('Name of the new event? (you can change it later)');
  if (name === null) return;
  try {
    const r = await api('/api/events', { method: 'POST', body: { name: name.trim() } });
    if (!events) events = [];
    events.push(r.event);
    if (r.draft) renderDraft(r.draft);
    selectEvent(r.event.id);
    setEvStatus('New event created (hidden). Fill in the details and a date, then set Visible.', 'ok');
  } catch (e) {
    alert('Could not create event:\n\n' + e.message);
  }
});

$('#event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentEvent) return;
  const btn = $('#ev-save-btn');
  btn.disabled = true;
  const payload = {
    name: $('#ev-name').value,
    date: $('#ev-date').value,
    endDate: $('#ev-end-date').value,
    venue: $('#ev-venue').value,
    stallNumber: $('#ev-stall').value,
    url: $('#ev-url').value,
    status: $('#ev-status').value,
    description: $('#ev-desc').value,
    hidden: isEvHidden(),
  };
  try {
    setEvStatus('Saving to draft…', 'busy');
    const r = await api('/api/events/' + currentEvent.id, { method: 'PUT', body: payload });
    currentEvent = r.event;
    const i = events.findIndex((x) => x.id === currentEvent.id);
    if (i >= 0) events[i] = currentEvent;
    $('#ev-title').textContent = currentEvent.name;
    renderEventList();
    if (r.draft) renderDraft(r.draft);
    setEvStatus('Saved to draft.', 'ok');
  } catch (e2) {
    setEvStatus(e2.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

/* ================= Collections editor ================= */
let collections = null;         // list from /api/collections
let currentCollection = null;   // the selected collection object
let colMembers = [];            // working copy of member IDs (order = site order)
let colBaseline = '';           // JSON of last-saved members, for dirty detection
let colDescBaseline = '';       // last-saved short summary (frontmatter description)
let colBodyBaseline = '';       // last-saved page description (markdown body)
let colDrag = null;             // active drag: { source: 'pool' | 'member', id }
let colDropTarget = null;       // { index, after } computed during dragover
let colNewHero = null;          // File chosen for a new collection's hero
let colSlugEdited = false;      // has the user hand-edited the new-collection slug?

function slugifyClient(s) {
  return String(s).toLowerCase().trim()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
function productsById() {
  const m = new Map();
  products.forEach((p) => m.set(p.id, p));
  return m;
}
function renderableCount(memberIds, byId) {
  return memberIds.filter((id) => { const p = byId.get(id); return p && !p.hidden; }).length;
}
function colDirty() {
  return JSON.stringify(colMembers) !== colBaseline
    || ($('#col-desc').value.trim() !== colDescBaseline)
    || ($('#col-body').value.replace(/\r\n/g, '\n').trim() !== colBodyBaseline);
}
function confirmDiscardColIfDirty() {
  if (currentCollection && colDirty()) {
    return confirm('You have unsaved changes to this collection. Discard them?');
  }
  return true;
}
function setColStatus(msg, kind) {
  const el = $('#col-save-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'save-status ' + (kind || '');
}
function updateColSaveButton() {
  const btn = $('#col-save-btn');
  if (btn) btn.disabled = !colDirty();
}

/* ---- Collections filters (reuse the Gallery predicate + option set) ---- */
function buildColFilters() {
  fillProductFilterSelects($('#col-filter-category'), $('#col-filter-theme'), $('#col-filter-status'));
  ['#col-filter-category', '#col-filter-theme', '#col-filter-status', '#col-filter-visibility'].forEach((sel) =>
    $(sel).addEventListener('change', applyColFilters));
  $('#col-search').addEventListener('input', applyColFilters);
  $('#col-filter-clear').addEventListener('click', () => {
    $('#col-search').value = '';
    $('#col-filter-category').value = '';
    $('#col-filter-theme').value = '';
    $('#col-filter-status').value = '';
    $('#col-filter-visibility').value = '';
    applyColFilters();
  });
}
function applyColFilters() {
  const crit = {
    q: $('#col-search').value.toLowerCase().trim(),
    cat: $('#col-filter-category').value,
    theme: $('#col-filter-theme').value,
    status: $('#col-filter-status').value,
    vis: $('#col-filter-visibility').value,
  };
  const list = filterProducts(products, crit);
  renderColPool(list);
  const active = !!(crit.q || crit.cat || crit.theme || crit.status || crit.vis);
  $('#col-filter-clear').hidden = !active;
  $('#col-pool-count').textContent = active
    ? `Showing ${list.length} of ${products.length}`
    : `${products.length} pieces`;
}

/* ---- Collection list (selector) ---- */
async function loadCollectionList() {
  collections = await api('/api/collections');
  renderCollectionList();
}
async function resetCollectionsView() {
  currentCollection = null;
  colMembers = [];
  colBaseline = '';
  colDescBaseline = '';
  colBodyBaseline = '';
  $('#col-desc').value = '';
  $('#col-body').value = '';
  $('#col-workspace').hidden = true;
  $('#col-empty-state').hidden = false;
  if (collections !== null) await loadCollectionList();
}
function renderCollectionList() {
  const wrap = $('#collection-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const byId = productsById();
  (collections || []).forEach((col) => {
    const shown = renderableCount(col.members, byId);
    const btn = document.createElement('button');
    btn.className = 'product-item' + (currentCollection && currentCollection.slug === col.slug ? ' active' : '') + (shown === 0 ? ' is-hidden' : '');
    btn.dataset.slug = col.slug;
    const sub = shown === 0
      ? '<span class="pi-tag hidden">hidden on site (empty)</span>'
      : `${shown} shown on site`;
    btn.innerHTML = `
      <span>
        <span class="pi-title">${escapeHtml(col.title)} <span class="muted">(${col.members.length})</span></span><br/>
        <span class="pi-meta">${sub}</span>
      </span>`;
    btn.addEventListener('click', () => selectCollection(col.slug));
    wrap.appendChild(btn);
  });
}

function selectCollection(slug) {
  if (!confirmDiscardColIfDirty()) return;
  currentCollection = (collections || []).find((c) => c.slug === slug);
  if (!currentCollection) return;
  colMembers = [...currentCollection.members];
  colBaseline = JSON.stringify(colMembers);
  // Wording fields (page description = markdown body; short summary = frontmatter)
  colDescBaseline = (currentCollection.description || '').trim();
  colBodyBaseline = (currentCollection.body || '').replace(/\r\n/g, '\n').trim();
  $('#col-desc').value = colDescBaseline;
  $('#col-body').value = colBodyBaseline;
  $('#col-empty-state').hidden = true;
  $('#col-workspace').hidden = false;
  $('#col-title').textContent = currentCollection.title;
  renderCollectionList();
  renderColWorkspace();
  setColStatus('', '');
  updateColSaveButton();
}

// Typing in the wording fields marks the collection dirty (like editing members).
['#col-desc', '#col-body'].forEach((sel) =>
  $(sel).addEventListener('input', () => {
    if (!currentCollection) return;
    updateColSaveButton();
    setColStatus(colDirty() ? 'Unsaved changes — click “Save to draft”.' : '', colDirty() ? 'busy' : '');
  }));

function renderColWorkspace() {
  renderColMembers();
  applyColFilters(); // renders the pool (reflects current membership dimming)
  const byId = productsById();
  const shown = renderableCount(colMembers, byId);
  const metaText = `${colMembers.length} piece${colMembers.length === 1 ? '' : 's'} · ${shown} shown on the website`
    + (shown === 0 ? ' · hidden while empty' : '');
  $('#col-meta').textContent = metaText;
}

/* ---- Left pane: the pool of all pieces ---- */
function renderColPool(list) {
  const wrap = $('#col-pool');
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<p class="filter-count">No pieces match.</p>';
    return;
  }
  const memberSet = new Set(colMembers);
  list.forEach((p) => {
    const inCol = memberSet.has(p.id);
    const row = document.createElement('div');
    row.className = 'col-row' + (inCol ? ' in-collection' : '');
    row.dataset.id = p.id;
    row.draggable = !inCol;
    const thumb = p.mainUrl ? `<img src="${p.mainUrl}" alt="" loading="lazy" />` : '<span class="col-row-noimg">no img</span>';
    const tags = `${p.hidden ? '<span class="pi-tag hidden">hidden</span>' : ''}${inCol ? '<span class="pi-tag featured">in collection</span>' : ''}`;
    row.innerHTML = `
      ${thumb}
      <span class="col-row-main">
        <span class="col-row-title">${escapeHtml(p.title)} ${tags}</span>
        <span class="col-row-meta"><span class="status-dot s-${p.status}"></span>${p.id} · ${p.category}</span>
      </span>
      ${inCol ? '<span class="muted small">✓ added</span>' : '<button type="button" class="row-btn add">＋ Add</button>'}`;
    if (!inCol) {
      row.querySelector('.add').addEventListener('click', () => addMember(p.id));
      row.addEventListener('dragstart', (ev) => {
        colDrag = { source: 'pool', id: p.id };
        ev.dataTransfer.setData('text/plain', p.id);
        ev.dataTransfer.effectAllowed = 'copy';
      });
      row.addEventListener('dragend', () => { colDrag = null; clearDropMarkers(); });
    }
    wrap.appendChild(row);
  });
}

/* ---- Right pane: members in display order ---- */
function renderColMembers() {
  const wrap = $('#col-members');
  wrap.innerHTML = '';
  if (!colMembers.length) {
    wrap.innerHTML = '<div class="members-empty">No pieces yet. Drag from “All pieces”, or click “＋ Add”. An empty collection stays hidden on the website until it has a piece.</div>';
    return;
  }
  const byId = productsById();
  colMembers.forEach((id, index) => {
    const p = byId.get(id);
    const row = document.createElement('div');
    row.dataset.id = id;
    row.draggable = true;
    if (p) {
      row.className = 'col-row';
      const thumb = p.mainUrl ? `<img src="${p.mainUrl}" alt="" loading="lazy" />` : '<span class="col-row-noimg">no img</span>';
      const tag = p.hidden ? '<span class="pi-tag hidden">hidden — won’t show on site</span>' : '';
      row.innerHTML = `
        <span class="col-drag-handle" title="Drag to reorder">⠿</span>
        ${thumb}
        <span class="col-row-main">
          <span class="col-row-title">${escapeHtml(p.title)} ${tag}</span>
          <span class="col-row-meta"><span class="status-dot s-${p.status}"></span>${p.id} · ${p.category}</span>
        </span>
        <button type="button" class="row-btn remove" title="Removes from this collection only — the piece stays in the gallery">Remove</button>`;
    } else {
      row.className = 'col-row orphan';
      row.innerHTML = `
        <span class="col-drag-handle" title="Drag to reorder">⠿</span>
        <span class="col-row-noimg">—</span>
        <span class="col-row-main">
          <span class="col-row-title">${escapeHtml(id)} <span class="pi-tag hidden">awaiting photos</span></span>
          <span class="col-row-meta">No published piece yet — kept in order, hidden on the site</span>
        </span>
        <button type="button" class="row-btn remove" title="Removes from this collection only">Remove</button>`;
    }
    row.querySelector('.remove').addEventListener('click', () => removeMember(id));
    attachMemberDrag(row, index);
    wrap.appendChild(row);
  });
}

function attachMemberDrag(row, index) {
  row.addEventListener('dragstart', (ev) => {
    colDrag = { source: 'member', id: row.dataset.id };
    ev.dataTransfer.setData('text/plain', row.dataset.id);
    ev.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); colDrag = null; colDropTarget = null; clearDropMarkers(); });
  row.addEventListener('dragover', (ev) => {
    if (!colDrag) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = colDrag.source === 'pool' ? 'copy' : 'move';
    const rect = row.getBoundingClientRect();
    const after = (ev.clientY - rect.top) > rect.height / 2;
    clearDropMarkers();
    row.classList.add(after ? 'drop-after' : 'drop-before');
    colDropTarget = { index, after };
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
  row.addEventListener('drop', (ev) => { ev.preventDefault(); ev.stopPropagation(); handleMemberDrop(); });
}

function clearDropMarkers() {
  $('#col-members').querySelectorAll('.drop-before, .drop-after')
    .forEach((el) => el.classList.remove('drop-before', 'drop-after'));
}

// Container-level drop zone: catches drops in the empty area (append to end).
(function setupMembersDropZone() {
  const z = $('#col-members');
  if (!z) return;
  z.addEventListener('dragover', (e) => {
    if (!colDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = colDrag.source === 'pool' ? 'copy' : 'move';
    if (e.target === z) { clearDropMarkers(); colDropTarget = null; } // over empty space → append
    z.classList.add('drop-active');
  });
  z.addEventListener('dragleave', (e) => { if (e.target === z) z.classList.remove('drop-active'); });
  z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('drop-active'); handleMemberDrop(); });
})();

function handleMemberDrop() {
  if (!colDrag) return;
  const { source, id } = colDrag;
  let insertAt = colDropTarget ? colDropTarget.index + (colDropTarget.after ? 1 : 0) : colMembers.length;
  if (source === 'member') {
    const cur = colMembers.indexOf(id);
    if (cur < 0) { colDrag = null; colDropTarget = null; return; }
    colMembers.splice(cur, 1);
    if (cur < insertAt) insertAt--;
    colMembers.splice(insertAt, 0, id);
  } else { // from the pool
    if (colMembers.includes(id)) { colDrag = null; colDropTarget = null; clearDropMarkers(); return; }
    if (insertAt < 0) insertAt = 0;
    if (insertAt > colMembers.length) insertAt = colMembers.length;
    colMembers.splice(insertAt, 0, id);
  }
  colDrag = null;
  colDropTarget = null;
  afterMemberChange();
}

function addMember(id) {
  if (colMembers.includes(id)) return;
  colMembers.push(id);
  afterMemberChange();
}
function removeMember(id) {
  colMembers = colMembers.filter((x) => x !== id);
  afterMemberChange();
}
function afterMemberChange() {
  renderColWorkspace();
  updateColSaveButton();
  setColStatus(colDirty() ? 'Unsaved changes — click “Save to draft”.' : '', colDirty() ? 'busy' : '');
}

/* ---- Save members, description and page body ---- */
$('#col-save-btn').addEventListener('click', async () => {
  if (!currentCollection) return;
  const btn = $('#col-save-btn');
  btn.disabled = true;
  setColStatus('Saving to draft…', 'busy');
  try {
    const payload = {
      members: colMembers,
      description: $('#col-desc').value.trim(),
      body: $('#col-body').value,
    };
    const r = await api('/api/collections/' + currentCollection.slug, { method: 'PUT', body: payload });
    colMembers = r.members;
    colBaseline = JSON.stringify(colMembers);
    colDescBaseline = (r.description || '').trim();
    colBodyBaseline = (r.body || '').replace(/\r\n/g, '\n').trim();
    $('#col-desc').value = colDescBaseline;
    $('#col-body').value = colBodyBaseline;
    // Reflect the saved values back into the cached collection list.
    currentCollection.members = [...colMembers];
    currentCollection.description = colDescBaseline;
    currentCollection.body = colBodyBaseline;
    const idx = (collections || []).findIndex((c) => c.slug === currentCollection.slug);
    if (idx >= 0) collections[idx] = { ...collections[idx], members: [...colMembers], description: colDescBaseline, body: colBodyBaseline };
    if (r.draft) renderDraft(r.draft);
    renderCollectionList();
    renderColWorkspace();
    setColStatus('Saved to draft.', 'ok');
  } catch (e) {
    setColStatus(e.message, 'err');
  } finally {
    updateColSaveButton();
  }
});

/* ---- New collection modal ---- */
$('#col-new-btn').addEventListener('click', openColModal);
function openColModal() {
  colSlugEdited = false;
  colNewHero = null;
  $('#col-new-title').value = '';
  $('#col-new-slug').value = '';
  $('#col-new-desc').value = '';
  const maxOrder = (collections || []).reduce((m, c) => Math.max(m, c.order || 0), 0);
  $('#col-new-order').value = maxOrder + 10;
  $('#col-new-hero').value = '';
  $('#col-new-hero-name').textContent = '';
  $('#col-new-error').hidden = true;
  $('#col-modal').hidden = false;
  $('#col-new-title').focus();
}
function closeColModal() { $('#col-modal').hidden = true; }
$('#col-new-cancel').addEventListener('click', closeColModal);
$('#col-modal').addEventListener('click', (e) => { if (e.target.id === 'col-modal') closeColModal(); });
$('#col-new-slug').addEventListener('input', () => { colSlugEdited = true; });
$('#col-new-title').addEventListener('input', () => {
  if (!colSlugEdited) $('#col-new-slug').value = slugifyClient($('#col-new-title').value);
});
$('#col-new-hero').addEventListener('change', () => {
  const f = $('#col-new-hero').files[0];
  colNewHero = f || null;
  $('#col-new-hero-name').textContent = f ? f.name : '';
});
$('#col-new-create').addEventListener('click', async () => {
  const err = $('#col-new-error');
  err.hidden = true;
  const title = $('#col-new-title').value.trim();
  const slug = slugifyClient($('#col-new-slug').value || title);
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  if (!title) return showErr('Please enter a title.');
  if (!slug) return showErr('Please enter a valid web address.');
  if ((collections || []).some((c) => c.slug === slug)) return showErr('A collection with that web address already exists.');
  if (!colNewHero) return showErr('Please choose a hero image.');
  const btn = $('#col-new-create');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const heroDataBase64 = await fileToBase64(colNewHero);
    const orderVal = $('#col-new-order').value;
    const r = await api('/api/collections', {
      method: 'POST',
      body: {
        title, slug,
        description: $('#col-new-desc').value.trim(),
        order: orderVal === '' ? undefined : Number(orderVal),
        heroFilename: colNewHero.name,
        heroDataBase64,
      },
    });
    if (r.draft) renderDraft(r.draft);
    closeColModal();
    await loadCollectionList();
    await refreshMeta();
    selectCollection(r.slug);
  } catch (e) {
    showErr(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create collection';
  }
});

// Refresh cached meta so the Gallery tab's Collection dropdown includes new ones.
async function refreshMeta() {
  try {
    const m = await api('/api/meta');
    meta.collections = m.collections;
    buildCollectionSelect();
  } catch { /* non-fatal */ }
}

/* ================= Orders / checkout holds ================= */
const ordersList = $('#orders-list');
const ordersStatus = $('#orders-status');

function fmtWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

async function loadOrders() {
  ordersStatus.textContent = 'Loading…';
  ordersList.innerHTML = '';
  let data;
  try {
    data = await api('/api/orders');
  } catch (e) {
    ordersStatus.textContent = 'Could not load holds: ' + e.message;
    return;
  }
  if (data.configured === false) {
    ordersStatus.innerHTML =
      'Checkout holds aren’t connected yet. Add <code>"workerAdminToken"</code> to <code>admin/credentials.json</code> ' +
      '(matching the Worker’s <code>ADMIN_TOKEN</code> secret), then restart the admin tool.';
    return;
  }
  const orders = data.orders || [];
  if (!orders.length) {
    ordersStatus.textContent = 'No active holds — nothing is reserved right now.';
    return;
  }
  ordersStatus.textContent = orders.length + ' active hold' + (orders.length === 1 ? '' : 's') + '.';
  orders.forEach((o) => ordersList.appendChild(orderCard(o)));
}

function orderCard(o) {
  const card = document.createElement('div');
  card.className = 'order-card';
  const items = (o.items || [])
    .map((it) =>
      `<li>${escapeHtml(it.title)}` +
      (it.id ? ` <span class="muted mono">${escapeHtml(it.id)}</span>` : '') +
      (typeof it.price === 'number' ? ` — $${it.price}` : '') +
      `</li>`)
    .join('');
  card.innerHTML =
    `<div class="order-main">
       <div class="order-top">
         <span class="order-ref mono">#${escapeHtml(o.ref || '')}</span>
         <span class="muted small">${escapeHtml(fmtWhen(o.placedAt))}</span>
       </div>
       <div class="order-cust">${escapeHtml(o.name || '')} · <a href="mailto:${escapeHtml(o.email || '')}">${escapeHtml(o.email || '')}</a></div>
       <ul class="order-items">${items}</ul>
     </div>
     <div class="order-actions">
       <button type="button" class="btn btn-sm btn-danger" data-release="${escapeHtml(o.ref || '')}">Release back to sale</button>
     </div>`;
  return card;
}

ordersList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-release]');
  if (!btn) return;
  const ref = btn.getAttribute('data-release');
  if (!confirm('Release this order’s pieces back to sale?\n\nThe items become available to other buyers again, and this buyer’s payment link will no longer match an active hold.')) return;
  btn.disabled = true;
  btn.textContent = 'Releasing…';
  try {
    await api('/api/orders/release', { method: 'POST', body: { ref } });
    await loadOrders();
  } catch (err) {
    alert('Could not release: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Release back to sale';
  }
});

$('#orders-refresh').addEventListener('click', loadOrders);

/* ---------------- start ---------------- */
if (token) boot().catch(() => showLogin());
else showLogin();

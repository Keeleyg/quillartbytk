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
  await loadProductList();
  await refreshDraft();
}
function buildFilters() {
  $('#filter-category').innerHTML =
    '<option value="">All categories</option>' + meta.categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  $('#filter-theme').innerHTML =
    '<option value="">All themes</option>' + meta.themes.map((t) => `<option value="${t}">${t}</option>`).join('');
  $('#filter-status').innerHTML =
    '<option value="">All statuses</option>' + meta.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
  ['#filter-category', '#filter-theme', '#filter-status', '#filter-visibility'].forEach((sel) =>
    $(sel).addEventListener('change', applyFilters));
}
function applyFilters() {
  const q = $('#search').value.toLowerCase().trim();
  const cat = $('#filter-category').value;
  const theme = $('#filter-theme').value;
  const status = $('#filter-status').value;
  const vis = $('#filter-visibility').value;
  let list = products;
  if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.includes(q));
  if (cat) list = list.filter((p) => p.category === cat);
  if (theme) list = list.filter((p) => (p.themes || []).includes(theme));
  if (status) list = list.filter((p) => p.status === status);
  if (vis === 'visible') list = list.filter((p) => !p.hidden);
  else if (vis === 'hidden') list = list.filter((p) => p.hidden);
  renderProductList(list);
  const active = !!(q || cat || theme || status || vis);
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
    await refreshDraft();
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
    await refreshDraft();
  } catch (e) {
    alert('Discard failed:\n\n' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Discard';
  }
});

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
  $('#events-tab').hidden = name !== 'events';
  $('#tab-gallery').classList.toggle('active', name === 'gallery');
  $('#tab-events').classList.toggle('active', name === 'events');
  if (name === 'events' && events === null) loadEventList();
}
$('#tab-gallery').addEventListener('click', () => showTab('gallery'));
$('#tab-events').addEventListener('click', () => showTab('events'));

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
        <span class="pi-meta">${ev.date || '— no date'} · ${ev.status || ''}</span>
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

/* ---------------- start ---------------- */
if (token) boot().catch(() => showLogin());
else showLogin();

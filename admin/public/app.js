'use strict';

const LIVE_BASE = 'https://keeleyg.github.io/quillartbytk';
const $ = (sel) => document.querySelector(sel);

let token = sessionStorage.getItem('admin_token') || '';
let meta = null;
let products = [];
let current = null;
let chips = { palette: [], frames: [] };

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
  if (res.status === 401) { logout(); throw new Error('Session expired — please sign in again.'); }
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

/* ---------------- Boot ---------------- */
async function boot() {
  showApp();
  meta = await api('/api/meta');
  $('#branch-badge').textContent = 'editing: ' + meta.draft;
  buildStatusSelect();
  buildCollectionSelect();
  await loadProductList();
  await refreshDraft();
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
    window.open('/quillartbytk/', '_blank', 'noopener');
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
  renderProductList(products);
}
function renderProductList(list) {
  const wrap = $('#product-list');
  wrap.innerHTML = '';
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
    wrap.appendChild(btn);
  });
}
$('#search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderProductList(!q ? products : products.filter((p) =>
    p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.includes(q)));
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
    card.className = 'img-card';
    const delBtn = role === 'main' ? '' : `<button class="del" title="Delete" type="button">×</button>`;
    card.innerHTML = `<img src="${img.url}?t=${Date.now()}" alt="" />${delBtn}`;
    if (role !== 'main') card.querySelector('.del').addEventListener('click', () => deleteImage(role, img.path));
    el.appendChild(card);
  });
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
  if (!confirm('Remove this image from the draft?')) return;
  setStatus('Removing image…', 'busy');
  try {
    const data = await api(`/api/products/${current.slug}/images`, { method: 'DELETE', body: { role, path } });
    current.images = data.images;
    renderImages(data.images);
    if (data.draft) renderDraft(data.draft);
    setStatus('Image removed from draft.', 'ok');
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

/* ---------------- start ---------------- */
if (token) boot().catch(() => showLogin());
else showLogin();

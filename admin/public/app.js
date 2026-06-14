'use strict';

const LIVE_BASE = 'https://keeleyg.github.io/quillartbytk';
const $ = (sel) => document.querySelector(sel);

let token = sessionStorage.getItem('admin_token') || '';
let meta = null;
let products = [];
let current = null; // full product being edited
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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------- Auth ---------------- */
function showLogin() {
  $('#login-view').hidden = false;
  $('#app-view').hidden = true;
}
function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
}
function logout() {
  token = '';
  sessionStorage.removeItem('admin_token');
  showLogin();
}

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
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  }
});

$('#logout-btn').addEventListener('click', logout);

/* ---------------- Boot ---------------- */
async function boot() {
  showApp();
  meta = await api('/api/meta');
  $('#branch-badge').textContent = 'branch: ' + meta.branch;
  buildStatusSelect();
  buildCollectionSelect();
  await loadProductList();
}

function buildStatusSelect() {
  $('#f-status').innerHTML = meta.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
}
function buildCollectionSelect() {
  const opts = ['<option value="">(none)</option>']
    .concat(meta.collections.map((c) => `<option value="${c.slug}">${c.title}</option>`));
  $('#f-collection').innerHTML = opts.join('');
}

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
    btn.className = 'product-item' + (current && current.slug === p.slug ? ' active' : '');
    btn.dataset.slug = p.slug;
    btn.innerHTML = `
      <img src="${p.mainUrl}" alt="" loading="lazy" />
      <span>
        <span class="pi-title">${escapeHtml(p.title)}</span><br/>
        <span class="pi-meta"><span class="status-dot s-${p.status}"></span>${p.id} · ${p.category}</span>
      </span>`;
    btn.addEventListener('click', () => selectProduct(p.slug));
    wrap.appendChild(btn);
  });
}
$('#search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderProductList(
    !q ? products : products.filter((p) =>
      p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.includes(q))
  );
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
    });
  });
}
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
  renderImgGrid($('#img-main'), images.main ? [images.main] : [], 'main');
  renderImgGrid($('#img-angles'), images.angles, 'angles');
  renderImgGrid($('#img-process'), images.process, 'process');
}
function renderImgGrid(el, items, role) {
  el.innerHTML = '';
  items.forEach((img) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    const delBtn = role === 'main' ? '' : `<button class="del" title="Delete" type="button">×</button>`;
    card.innerHTML = `<img src="${img.url}" alt="" />${delBtn}`;
    if (role !== 'main') {
      card.querySelector('.del').addEventListener('click', () => deleteImage(role, img.path));
    }
    el.appendChild(card);
  });
}

document.querySelectorAll('input[type="file"]').forEach((inp) => {
  inp.addEventListener('change', async () => {
    if (!inp.files || !inp.files[0] || !current) return;
    const file = inp.files[0];
    const role = inp.dataset.role;
    setStatus('Uploading image…', 'busy');
    try {
      const dataBase64 = await fileToBase64(file);
      const data = await api(`/api/products/${current.slug}/images`, {
        method: 'POST',
        body: { role, filename: file.name, dataBase64 },
      });
      current.images = data.images;
      renderImages(data.images);
      setStatus('Image added — remember to Save & publish.', 'ok');
    } catch (e) {
      setStatus(e.message, 'err');
    }
    inp.value = '';
  });
});

async function deleteImage(role, path) {
  if (!confirm('Delete this image? It will be removed when you publish.')) return;
  setStatus('Removing image…', 'busy');
  try {
    const data = await api(`/api/products/${current.slug}/images`, {
      method: 'DELETE',
      body: { role, path },
    });
    current.images = data.images;
    renderImages(data.images);
    setStatus('Image removed — remember to Save & publish.', 'ok');
  } catch (e) {
    setStatus(e.message, 'err');
  }
}

/* ---------------- Save & publish ---------------- */
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
    category,
    themes,
    status: $('#f-status').value,
    price: $('#f-price').value === '' ? null : Number($('#f-price').value),
    lead_time: $('#f-lead').value,
    collection: $('#f-collection').value,
    commission_example: $('#f-commission').checked,
    multi_frame: $('#f-multiframe').checked,
    palette_variants: chips.palette,
    frame_options: chips.frames,
    confidence: current.confidence,
  };

  try {
    setStatus('Saving…', 'busy');
    await api('/api/products/' + current.slug, { method: 'PUT', body: payload });
    setStatus('Publishing (commit + push)…', 'busy');
    const pub = await api(`/api/products/${current.slug}/publish`, { method: 'POST' });
    setStatus(pub.committed ? pub.message : 'Saved — nothing new to publish.', 'ok');
    // Refresh list (title/status/thumbnail may have changed)
    current.title = payload.title;
    await loadProductList();
    $('#editor-title').textContent = payload.title;
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
if (token) {
  boot().catch(() => showLogin());
} else {
  showLogin();
}

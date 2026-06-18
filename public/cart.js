/* ------------------------------------------------------------------ *
 * Quillart by TK — client-side shopping cart                          *
 *                                                                     *
 * The site is statically hosted, so the cart lives entirely in the    *
 * browser (localStorage). Each piece is one-of-a-kind, so an item can  *
 * only ever be in the cart once (quantity is always 1). No customer,   *
 * payment or address data is stored here — that is only collected on   *
 * the checkout form and sent straight to Tracey by email.             *
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  var KEY = 'qabtk_cart_v1';

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) {
      /* storage full / disabled — cart just won't persist */
    }
    updateBadges(items);
    document.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
  }

  function add(item) {
    if (!item || !item.id) return false;
    var items = read();
    if (items.some(function (i) { return i.id === item.id; })) return false;
    items.push({
      id: String(item.id),
      title: String(item.title || 'Untitled piece'),
      price: typeof item.price === 'number' && isFinite(item.price) ? item.price : null,
      image: String(item.image || ''),
      url: String(item.url || ''),
    });
    write(items);
    return true;
  }

  function remove(id) {
    write(read().filter(function (i) { return i.id !== id; }));
  }

  function clear() { write([]); }
  function has(id) { return read().some(function (i) { return i.id === id; }); }
  function count() { return read().length; }
  function subtotal() {
    return read().reduce(function (sum, i) {
      return sum + (typeof i.price === 'number' ? i.price : 0);
    }, 0);
  }

  /* Money formatter: whole dollars show as $50, otherwise $50.50 */
  function money(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return n % 1 === 0 ? '$' + n : '$' + n.toFixed(2);
  }

  /* ---- header badge(s) ------------------------------------------- */
  function updateBadges(items) {
    var n = (items || read()).length;
    var els = document.querySelectorAll('[data-cart-count]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = String(n);
      els[i].hidden = n === 0;
    }
  }

  /* ---- "Add to cart" buttons (event delegation) ------------------ */
  function reflect(btn) {
    if (!btn) return;
    var inCart = has(btn.getAttribute('data-id'));
    btn.classList.toggle('in-cart', inCart);
    var added = btn.getAttribute('data-added-label') || 'In cart ✓';
    var idle = btn.getAttribute('data-idle-label') || btn.textContent;
    if (!btn.getAttribute('data-idle-label')) btn.setAttribute('data-idle-label', idle);
    btn.textContent = inCart ? added : btn.getAttribute('data-idle-label');
  }

  function reflectAll() {
    var btns = document.querySelectorAll('[data-add-to-cart]');
    for (var i = 0; i < btns.length; i++) reflect(btns[i]);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-add-to-cart]') : null;
    if (!btn) return;
    e.preventDefault();
    var id = btn.getAttribute('data-id');
    if (RESERVED.has(id)) { markButtonReserved(btn); return; }
    if (has(id)) {
      // Second click on an in-cart item → go to the cart
      window.location.href = btn.getAttribute('data-cart-url') || '/cart';
      return;
    }
    var priceRaw = btn.getAttribute('data-price');
    add({
      id: id,
      title: btn.getAttribute('data-title'),
      price: priceRaw === '' || priceRaw === null ? null : Number(priceRaw),
      image: btn.getAttribute('data-image'),
      url: btn.getAttribute('data-url'),
    });
    reflectAll();
  });

  document.addEventListener('cart:change', reflectAll);

  /* ---- live reservations (the "seat map") ------------------------ *
   * One-of-a-kind pieces are held the moment another buyer places an  *
   * order, so we fetch the reserved list and lock those items here.   */
  var RESERVED = new Set();

  function isReserved(id) { return RESERVED.has(id); }

  function markButtonReserved(b) {
    b.disabled = true;
    b.classList.add('reserved');
    b.textContent = b.getAttribute('data-reserved-label') || 'Reserved';
    var card = b.parentElement;
    if (card) {
      var imgWrap = card.querySelector('.aspect-square');
      if (imgWrap && !imgWrap.querySelector('[data-reserved-badge]')) {
        var badge = document.createElement('span');
        badge.setAttribute('data-reserved-badge', '');
        badge.className = 'absolute top-2 right-2 z-10 bg-ink text-paper text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded shadow-sm';
        badge.textContent = 'Reserved';
        imgWrap.appendChild(badge);
      }
    }
  }

  function applyReservations() {
    var btns = document.querySelectorAll('[data-add-to-cart]');
    for (var i = 0; i < btns.length; i++) {
      if (RESERVED.has(btns[i].getAttribute('data-id'))) markButtonReserved(btns[i]);
    }
  }

  function fetchReservations() {
    fetch('/api/reservations', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !Array.isArray(d.ids)) return;
        RESERVED = new Set(d.ids);
        applyReservations();
        document.dispatchEvent(new CustomEvent('reservations:loaded', { detail: d.ids }));
      })
      .catch(function () { /* offline / local dev — leave items buyable */ });
  }

  function init() { updateBadges(); reflectAll(); fetchReservations(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Cart = {
    read: read, add: add, remove: remove, clear: clear,
    has: has, count: count, subtotal: subtotal, money: money,
    isReserved: isReserved,
    reservedIds: function () { return Array.from(RESERVED); },
  };
})();

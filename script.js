(function () {
  "use strict";

  var BRAND = "Quillart by TK";
  var products = [];
  var gallery = document.getElementById("gallery");
  var lightbox = document.getElementById("lightbox");
  var lightboxImage = document.getElementById("lightbox-image");
  var lightboxDetails = document.getElementById("lightbox-details");
  var filterChips = document.querySelectorAll(".filter-chip");
  var originalTitle = document.title;

  // --- Helpers ---

  function parseHash() {
    var params = {};
    var hash = location.hash.slice(1);
    hash.split("&").forEach(function (part) {
      var eq = part.indexOf("=");
      if (eq === -1) return;
      var key = decodeURIComponent(part.slice(0, eq));
      var val = decodeURIComponent(part.slice(eq + 1));
      if (key) params[key] = val;
    });
    return params;
  }

  function setHash(params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      if (params[key]) parts.push(key + "=" + encodeURIComponent(params[key]));
    });
    var newHash = parts.length ? "#" + parts.join("&") : location.pathname;
    history.replaceState(null, "", newHash);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatPrice(price, currency) {
    return "$" + price.toLocaleString("en-AU") + " " + (currency || "AUD");
  }

  function isPriceFirm(item) {
    if (typeof item.priceIsFirm === "boolean") return item.priceIsFirm;
    return item.status === "available";
  }

  function getLeadTimeWeeks(item) {
    return item.leadTimeWeeks || CONFIG.defaultLeadTimeWeeks;
  }

  // --- Card helpers ---

  function isCard(item) {
    return item.category === "cards";
  }

  function getUnitPrice(item) {
    if (typeof item.unitPrice === "number") return item.unitPrice;
    if (CONFIG.cards && typeof CONFIG.cards.defaultUnitPrice === "number") {
      return CONFIG.cards.defaultUnitPrice;
    }
    return item.price;
  }

  function getImages(item) {
    if (Array.isArray(item.images) && item.images.length > 0) {
      return item.images.map(resolveFilename);
    }
    return [item.image];
  }

  function getVariants(item) {
    if (Array.isArray(item.variants) && item.variants.length > 0) return item.variants;
    var imgs = getImages(item);
    var allIndexes = [];
    for (var i = 0; i < imgs.length; i++) allIndexes.push(i);
    return [{ id: null, name: null, description: null, imageIndexes: allIndexes }];
  }

  // --- Image role helpers ---

  function resolveFilename(entry) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry.filename === "string") return entry.filename;
    return "";
  }

  function getImageRole(entry) {
    if (typeof entry === "string") return "main";
    if (entry && typeof entry.role === "string") return entry.role;
    return "main";
  }

  function getRawImages(item) {
    if (Array.isArray(item.images) && item.images.length > 0) return item.images;
    if (item.image) return [item.image];
    return [];
  }

  function getMainImage(item) {
    var raw = getRawImages(item);
    var i;
    for (i = 0; i < raw.length; i++) {
      if (getImageRole(raw[i]) === "main") return resolveFilename(raw[i]);
    }
    for (i = 0; i < raw.length; i++) {
      if (getImageRole(raw[i]) === "angle") return resolveFilename(raw[i]);
    }
    return null;
  }

  function getAngleImages(item) {
    return getRawImages(item)
      .filter(function (e) { return getImageRole(e) === "angle"; })
      .map(resolveFilename);
  }

  function getProcessImages(item) {
    return getRawImages(item)
      .filter(function (e) { return getImageRole(e) === "process"; })
      .map(resolveFilename);
  }

  function getDisplayImages(item) {
    return getRawImages(item)
      .filter(function (e) { return getImageRole(e) !== "process"; })
      .map(resolveFilename);
  }

  // --- Mailto builders ---

  function buildPurchaseMailto(item) {
    var subject = "Purchase enquiry: " + item.title + " (ID " + item.id + ")";
    var body =
      "Hi,\n\n" +
      "I'd like to purchase \"" + item.title + "\" (ID " + item.id + ", " +
      formatPrice(item.price, item.currency) + ").\n" +
      "Please send a Zeller Invoice to this email.\n\n" +
      "Shipping address:\n";
    return (
      "mailto:" + CONFIG.email +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body)
    );
  }

  function buildCommissionMailto(item) {
    var subject = "Commission enquiry: " + item.title + " (ID " + item.id + ")";
    var body =
      "Hi,\n\n" +
      "I'd like to commission a piece based on \"" + item.title + "\" (ID " + item.id + ").\n" +
      "Guide price: " + formatPrice(item.price, item.currency) +
      " (final quote will depend on your variations and any size changes)." +
      " Lead time understood: ~" + getLeadTimeWeeks(item) + " weeks.\n\n" +
      "Variations from the reference piece (leave blank if you want it as-is):\n" +
      "  Subject / motif:\n" +
      "  Colour palette:\n" +
      "  Frame / medium:\n" +
      "  Size:\n" +
      "  Personalisation (names, dates, words):\n\n" +
      "Reference photos:\n" +
      "(Please attach any reference images to this email if helpful - inspiration shots, photos of the subject, your space, etc.)\n\n" +
      "Shipping address:\n";
    return (
      "mailto:" + CONFIG.email +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body)
    );
  }

  function buildCardMailto(item) {
    var up = getUnitPrice(item);
    var variants = getVariants(item);
    var subject = "Order enquiry: " + item.title;
    var body =
      "Hi,\n\n" +
      "I'd like to order cards from your \"" + item.title + "\" range.\n\n";

    if (variants.length > 0 && variants[0].id) {
      body += "Designs available:\n";
      variants.forEach(function (v) {
        body += "  " + v.id + " - " + v.name + ": $" + up + " each\n";
      });
      body += "\n";
    }

    if (Array.isArray(item.bulkTiers) && item.bulkTiers.length > 0) {
      body += "Bulk pricing available: ";
      body += item.bulkTiers.map(function (t) {
        return t.quantity + " for $" + t.totalPrice;
      }).join(", ");
      body += "\n\n";
    }

    body +=
      "Please indicate which design(s) and how many of each:\n" +
      "  Design ID:        Quantity:\n" +
      "  Design ID:        Quantity:\n" +
      "  Design ID:        Quantity:\n\n" +
      "Personalisation / wording inside the card(s):\n\n\n" +
      "Shipping address:\n";

    return (
      "mailto:" + CONFIG.email +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body)
    );
  }

  // --- Price display ---

  function cardPriceHtml(item) {
    if (isCard(item)) {
      var up = getUnitPrice(item);
      var html = '<p class="card-price"><span class="price-from">From </span>' +
        formatPrice(up, item.currency) + " each</p>";
      if (Array.isArray(item.bulkTiers) && item.bulkTiers.length > 0) {
        var t = item.bulkTiers[0];
        html += '<p class="card-bulk-hint">or ' + t.quantity + " for " +
          formatPrice(t.totalPrice, item.currency) + "</p>";
      }
      return html;
    }
    var price = formatPrice(item.price, item.currency);
    if (isPriceFirm(item)) {
      return '<p class="card-price">' + price + "</p>";
    }
    return '<p class="card-price"><span class="price-from">from </span>' + price + "</p>";
  }

  function lightboxPriceHtml(item) {
    if (isCard(item)) {
      var up = getUnitPrice(item);
      var html = '<p class="lightbox-price">' + formatPrice(up, item.currency) + " each</p>";
      if (Array.isArray(item.bulkTiers) && item.bulkTiers.length > 0) {
        html += '<div class="lightbox-bulk-tiers">';
        item.bulkTiers.forEach(function (t) {
          html += '<span class="bulk-tier">' + t.quantity + " for " +
            formatPrice(t.totalPrice, item.currency) + "</span>";
        });
        html += "</div>";
      }
      if (item.status === "order") {
        var lt = item.leadTimeWeeks ? " · ~" + item.leadTimeWeeks + " weeks" : "";
        html += '<span class="card-made-to-order-pill">Made to order' + lt + "</span>";
      }
      return html;
    }
    var price = formatPrice(item.price, item.currency);
    if (item.status === "available") {
      return '<p class="lightbox-price">' + price + ' <span class="price-note">— in stock, ready to ship</span></p>';
    }
    if (item.status === "order") {
      return '<p class="lightbox-price"><span class="price-from">From </span>' + price + ' <span class="price-note">— guide price; final quote on enquiry</span></p>';
    }
    if (item.status === "reserved") {
      return '<p class="lightbox-price"><span class="price-from">From </span>' + price + ' <span class="price-note">— currently reserved</span></p>';
    }
    return '<p class="lightbox-price">' + price + "</p>";
  }

  // --- Card & gallery ---

  function createCard(item) {
    var thumbSrc = getMainImage(item);
    if (!thumbSrc) {
      console.error("[Quillart] Product " + item.id + " has no main or angle image — skipping.");
      return null;
    }

    var card = document.createElement("article");
    card.className = "card";
    card.dataset.status = item.status;
    card.dataset.id = item.id;

    var badgeHtml = "";
    if (item.status === "sold") {
      badgeHtml = '<span class="card-badge card-badge--sold">Sold</span>';
    } else if (item.status === "reserved") {
      badgeHtml = '<span class="card-badge card-badge--reserved">Reserved</span>';
    }

    var actionHtml = "";
    if (isCard(item)) {
      actionHtml =
        '<a href="' + buildCardMailto(item) +
        '" class="btn btn-primary btn-enquire">Order cards</a>';
    } else if (item.status === "available") {
      actionHtml =
        '<a href="' + buildPurchaseMailto(item) +
        '" class="btn btn-primary btn-enquire">Purchase</a>';
    } else if (item.status === "order") {
      actionHtml =
        '<a href="' + buildCommissionMailto(item) +
        '" class="btn btn-primary btn-enquire">Commission this style</a>';
    }

    card.innerHTML =
      '<div class="card-image-wrap" role="button" tabindex="0" aria-label="View ' +
      escapeHtml(item.title) + '">' +
      '<img src="' + escapeHtml(thumbSrc) + '" alt="' + escapeHtml(item.title) +
      '" loading="lazy" onerror="this.style.display=\'none\';this.insertAdjacentHTML(\'afterend\',\'<div class=img-placeholder>Image coming soon</div>\')">' +
      badgeHtml +
      "</div>" +
      '<div class="card-body">' +
      '<h3 class="card-title">' + escapeHtml(item.title) + "</h3>" +
      '<p class="card-meta">' + escapeHtml(item.dimensions) + "</p>" +
      cardPriceHtml(item) +
      actionHtml +
      "</div>";

    var imageWrap = card.querySelector(".card-image-wrap");
    imageWrap.addEventListener("click", function () {
      openLightbox(item);
    });
    imageWrap.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(item);
      }
    });

    return card;
  }

  function renderGallery(filter) {
    gallery.innerHTML = "";
    var filtered = products;
    if (filter === "available") {
      filtered = products.filter(function (p) {
        return p.status === "available";
      });
    } else if (filter === "sold") {
      filtered = products.filter(function (p) {
        return p.status === "sold" || p.status === "reserved";
      });
    }

    if (filtered.length === 0) {
      gallery.innerHTML =
        '<div class="gallery-empty-cta">' +
        '<p class="gallery-empty">No pieces match these filters — but anything can be made to order.</p>' +
        '<a href="commission.html" class="btn btn-primary">Commission a custom piece</a>' +
        "</div>";
      return;
    }

    filtered.forEach(function (item) {
      var card = createCard(item);
      if (card) gallery.appendChild(card);
    });

    var cta = document.createElement("div");
    cta.className = "gallery-cta-banner";
    cta.innerHTML =
      "<p>Don't see what you're looking for?</p>" +
      '<a href="commission.html" class="btn btn-primary">Commission a custom piece</a>';
    gallery.appendChild(cta);
  }

  // --- Lightbox ---

  // --- Card variant selector ---

  function renderVariantSelector(item) {
    var variants = getVariants(item);
    var images = getImages(item);
    if (variants.length <= 1 && !variants[0].id) return "";

    var html = '<div class="variant-selector">';
    html += '<h3 class="variant-heading">Designs</h3>';
    html += '<div class="variant-cards">';
    variants.forEach(function (v, i) {
      var thumbSrc = images[v.imageIndexes[0]] || images[0];
      html +=
        '<div class="variant-card' + (i === 0 ? " active" : "") +
        '" data-variant-index="' + i + '">' +
        '<img src="' + escapeHtml(thumbSrc) + '" alt="' + escapeHtml(v.name || "") +
        '" class="variant-card-thumb" loading="lazy">' +
        '<div class="variant-card-info">' +
        '<span class="variant-card-id">' + escapeHtml(v.id || "") + "</span>" +
        '<span class="variant-card-name">' + escapeHtml(v.name || "") + "</span>" +
        (v.description ? '<p class="variant-card-desc">' + escapeHtml(v.description) + "</p>" : "") +
        "</div></div>";
    });
    html += "</div>";
    html += '<button class="variant-show-all" hidden>Show all designs</button>';

    html += '<div class="variant-image-strip">';
    var rawImgs = getRawImages(item);
    images.forEach(function (img, i) {
      if (getImageRole(rawImgs[i]) === "process") return;
      html +=
        '<img src="' + escapeHtml(img) +
        '" alt="Image ' + (i + 1) +
        '" class="variant-thumb" data-image-index="' + i + '"' +
        ' loading="lazy">';
    });
    html += "</div></div>";
    return html;
  }

  function wireVariantListeners(item) {
    var variants = getVariants(item);
    var images = getImages(item);
    var cardsContainer = lightboxDetails.querySelector(".variant-cards");
    var stripContainer = lightboxDetails.querySelector(".variant-image-strip");
    var showAllBtn = lightboxDetails.querySelector(".variant-show-all");
    if (!cardsContainer) return;

    function selectVariant(idx) {
      var v = variants[idx];
      cardsContainer.querySelectorAll(".variant-card").forEach(function (c, i) {
        c.classList.toggle("active", i === idx);
      });
      if (stripContainer) {
        stripContainer.querySelectorAll(".variant-thumb").forEach(function (t) {
          var imgIdx = parseInt(t.dataset.imageIndex, 10);
          t.hidden = v.imageIndexes.indexOf(imgIdx) === -1;
        });
      }
      lightboxImage.src = images[v.imageIndexes[0]];
      if (showAllBtn) showAllBtn.hidden = false;
    }

    function showAll() {
      cardsContainer.querySelectorAll(".variant-card").forEach(function (c) {
        c.classList.remove("active");
      });
      if (stripContainer) {
        stripContainer.querySelectorAll(".variant-thumb").forEach(function (t) {
          t.hidden = false;
        });
      }
      if (showAllBtn) showAllBtn.hidden = true;
    }

    cardsContainer.addEventListener("click", function (e) {
      var card = e.target.closest(".variant-card");
      if (!card) return;
      selectVariant(parseInt(card.dataset.variantIndex, 10));
    });

    if (showAllBtn) {
      showAllBtn.addEventListener("click", showAll);
    }

    if (stripContainer) {
      stripContainer.addEventListener("click", function (e) {
        var thumb = e.target.closest(".variant-thumb");
        if (!thumb) return;
        lightboxImage.src = images[parseInt(thumb.dataset.imageIndex, 10)];
        stripContainer.querySelectorAll(".variant-thumb").forEach(function (t) {
          t.classList.remove("active");
        });
        thumb.classList.add("active");
      });
    }

    // Default: select first variant
    selectVariant(0);
  }

  // --- Process & image strip renderers ---

  function renderProcessSection(processImgs) {
    if (!processImgs || processImgs.length === 0) return "";
    var html = '<div class="process-section">';
    html += '<div class="process-separator"></div>';
    html += '<h3 class="process-heading">Watch it come together</h3>';
    html += '<div class="process-thumbnails">';
    processImgs.forEach(function (src, i) {
      html += '<div class="process-thumb-wrap" data-process-src="' + escapeHtml(src) + '">';
      html += '<img src="' + escapeHtml(src) + '" alt="Step ' + (i + 1) +
        '" class="process-thumb" loading="lazy">';
      html += '<span class="process-step-label">Step ' + (i + 1) + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<button class="process-back-btn" hidden>&#8592; Back to finished piece</button>';
    html += '</div>';
    return html;
  }

  function wireImageStripListeners() {
    var strip = lightboxDetails.querySelector(".lightbox-image-strip");
    if (!strip) return;
    strip.addEventListener("click", function (e) {
      var thumb = e.target.closest(".lightbox-strip-thumb");
      if (!thumb) return;
      lightboxImage.src = thumb.dataset.src;
      strip.querySelectorAll(".lightbox-strip-thumb").forEach(function (t) {
        t.classList.remove("active");
      });
      thumb.classList.add("active");
    });
  }

  function wireProcessListeners(mainSrc) {
    var section = lightboxDetails.querySelector(".process-section");
    if (!section) return;
    var backBtn = section.querySelector(".process-back-btn");
    var thumbs = section.querySelectorAll(".process-thumb-wrap");
    var strip = lightboxDetails.querySelector(".lightbox-image-strip");

    thumbs.forEach(function (wrap) {
      wrap.addEventListener("click", function () {
        lightboxImage.src = wrap.dataset.processSrc;
        if (backBtn) backBtn.hidden = false;
        if (strip) {
          strip.querySelectorAll(".lightbox-strip-thumb").forEach(function (t) {
            t.classList.remove("active");
          });
        }
      });
    });

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        lightboxImage.src = mainSrc;
        backBtn.hidden = true;
        if (strip) {
          strip.querySelectorAll(".lightbox-strip-thumb").forEach(function (t) {
            t.classList.toggle("active", t.dataset.src === mainSrc);
          });
        }
      });
    }
  }

  // --- Lightbox ---

  function openLightbox(item) {
    var mainImg = getMainImage(item);
    var processImgs = getProcessImages(item);

    lightboxImage.src = isCard(item) ? (getImages(item)[0] || "") : (mainImg || "");
    lightboxImage.alt = item.title;
    lightboxImage.style.display = "";
    lightboxImage.onerror = function () {
      this.style.display = "none";
    };

    // Preload images
    if (isCard(item)) {
      getDisplayImages(item).forEach(function (src) { new Image().src = src; });
    } else {
      getAngleImages(item).forEach(function (src) { new Image().src = src; });
    }
    processImgs.forEach(function (src) { new Image().src = src; });

    var processHtml = renderProcessSection(processImgs);

    if (isCard(item)) {
      lightboxDetails.innerHTML =
        '<h2 class="lightbox-title">' + escapeHtml(item.title) + "</h2>" +
        '<div class="lightbox-meta">' +
        "<span>" + escapeHtml(item.dimensions) + "</span>" +
        "<span>" + escapeHtml(item.medium) + "</span>" +
        "</div>" +
        lightboxPriceHtml(item) +
        '<p class="lightbox-description">' + escapeHtml(item.description) + "</p>" +
        renderVariantSelector(item) +
        '<a href="' + buildCardMailto(item) +
        '" class="btn btn-primary lightbox-enquire">Order cards</a>' +
        processHtml;

      wireVariantListeners(item);
    } else {
      var statusHtml = "";
      if (item.status === "sold") {
        statusHtml = '<span class="lightbox-status-badge card-badge--sold">Sold</span>';
      } else if (item.status === "reserved") {
        statusHtml = '<p class="lightbox-reserved-text">Currently reserved</p>';
      }

      var actionHtml = "";
      if (item.status === "available") {
        actionHtml =
          '<a href="' + buildPurchaseMailto(item) +
          '" class="btn btn-primary lightbox-enquire">Purchase</a>';
      } else if (item.status === "order") {
        actionHtml =
          '<a href="' + buildCommissionMailto(item) +
          '" class="btn btn-primary lightbox-enquire">Commission this style</a>';
      }

      var angleImgs = getAngleImages(item);
      var imageStripHtml = "";
      if (angleImgs.length > 0) {
        imageStripHtml = '<div class="lightbox-image-strip">';
        imageStripHtml += '<img src="' + escapeHtml(mainImg) + '" alt="' +
          escapeHtml(item.title) + '" class="lightbox-strip-thumb active" data-src="' +
          escapeHtml(mainImg) + '">';
        angleImgs.forEach(function (src, i) {
          imageStripHtml += '<img src="' + escapeHtml(src) + '" alt="' +
            escapeHtml(item.title) + ' — view ' + (i + 2) +
            '" class="lightbox-strip-thumb" data-src="' + escapeHtml(src) + '">';
        });
        imageStripHtml += "</div>";
      }

      lightboxDetails.innerHTML =
        '<h2 class="lightbox-title">' + escapeHtml(item.title) + "</h2>" +
        '<div class="lightbox-meta">' +
        "<span>" + escapeHtml(item.dimensions) + "</span>" +
        "<span>" + escapeHtml(item.medium) + "</span>" +
        "</div>" +
        lightboxPriceHtml(item) +
        statusHtml +
        '<p class="lightbox-description">' + escapeHtml(item.description) + "</p>" +
        imageStripHtml +
        actionHtml +
        processHtml;

      wireImageStripListeners();
    }

    wireProcessListeners(mainImg);

    lightbox.hidden = false;
    document.body.style.overflow = "hidden";

    var params = parseHash();
    params.item = item.id;
    setHash(params);
    document.title = item.title + " — " + BRAND;

    injectProductJsonLd(item);

    lightbox.querySelector(".lightbox-close").focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = "";
    document.title = originalTitle;

    var params = parseHash();
    delete params.item;
    setHash(params);

    clearProductJsonLd();
  }

  // --- JSON-LD ---

  function injectProductJsonLd(item) {
    var firm = isPriceFirm(item);
    var availability;
    if (item.status === "available") {
      availability = "https://schema.org/InStock";
    } else if (item.status === "order") {
      availability = "https://schema.org/MadeToOrder";
    } else if (item.status === "reserved") {
      availability = "https://schema.org/LimitedAvailability";
    } else {
      availability = "https://schema.org/SoldOut";
    }

    var offers = {
      "@type": "Offer",
      price: item.price,
      priceCurrency: item.currency || "AUD",
      availability: availability,
      url: CONFIG.baseUrl + "/#item=" + item.id
    };

    if (isCard(item)) {
      var up = getUnitPrice(item);
      offers.price = up;
      offers.priceSpecification = {
        "@type": "UnitPriceSpecification",
        price: up,
        priceCurrency: item.currency || "AUD",
        referenceQuantity: {
          "@type": "QuantitativeValue",
          value: 1,
          unitCode: "C62"
        }
      };
    } else if (!firm) {
      offers.priceSpecification = {
        "@type": "PriceSpecification",
        price: item.price,
        priceCurrency: item.currency || "AUD",
        valueAddedTaxIncluded: true,
        description: "Guide price; final quote on enquiry"
      };
    }

    var displayImgs = getDisplayImages(item);
    var productImage = displayImgs.length === 1
      ? CONFIG.baseUrl + "/" + displayImgs[0]
      : displayImgs.map(function (img) { return CONFIG.baseUrl + "/" + img; });

    var ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.title,
      description: item.description,
      image: productImage,
      url: CONFIG.baseUrl + "/#item=" + item.id,
      brand: {
        "@type": "Brand",
        name: BRAND
      },
      offers: offers,
      material: item.medium
    };
    var el = document.getElementById("product-jsonld");
    if (el) el.textContent = JSON.stringify(ld);
  }

  function clearProductJsonLd() {
    var el = document.getElementById("product-jsonld");
    if (el) el.textContent = "";
  }

  function injectItemListJsonLd() {
    var items = products.map(function (item, i) {
      return {
        "@type": "ListItem",
        position: i + 1,
        url: CONFIG.baseUrl + "/#item=" + item.id,
        name: item.title
      };
    });
    var ld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: BRAND + " — Artworks",
      numberOfItems: products.length,
      itemListElement: items
    };
    var el = document.getElementById("itemlist-jsonld");
    if (el) el.textContent = JSON.stringify(ld);
  }

  function injectSiteCopyrightYear() {
    var el = document.getElementById("site-jsonld");
    if (!el) return;
    try {
      var ld = JSON.parse(el.textContent);
      ld.copyrightYear = new Date().getFullYear();
      el.textContent = JSON.stringify(ld);
    } catch (e) { /* ignore */ }
  }

  // --- Filters ---

  function setActiveFilter(filter) {
    filterChips.forEach(function (chip) {
      chip.classList.toggle("active", chip.dataset.filter === filter);
    });

    var params = parseHash();
    if (filter === "all") {
      delete params.filter;
    } else {
      params.filter = filter;
    }
    setHash(params);

    renderGallery(filter);
  }

  // --- Init ---

  function init() {
    injectSiteCopyrightYear();

    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load products");
        return res.json();
      })
      .then(function (data) {
        products = data;

        // Image role validation
        products.forEach(function (p) {
          if (Array.isArray(p.images) && p.images.length > 0) {
            var mainCount = p.images.filter(function (e) {
              return getImageRole(e) === "main";
            }).length;
            if (mainCount === 0) {
              console.warn("[Quillart] Product " + p.id +
                " images array has no main image — will fall back to first angle.");
            } else if (mainCount > 1) {
              console.warn("[Quillart] Product " + p.id + " has " + mainCount +
                " main images — only the first is used as thumbnail.");
            }
          }
        });

        // Gentle validation for card products
        products.forEach(function (p) {
          if (p.category !== "cards") return;
          if (typeof p.unitPrice === "undefined") {
            console.warn("[Quillart] Card product " + p.id + " has no unitPrice — using default (" +
              (CONFIG.cards ? CONFIG.cards.defaultUnitPrice : "none") + ").");
          }
          if (!Array.isArray(p.variants) || p.variants.length === 0) {
            console.warn("[Quillart] Card product " + p.id + " has no variants — rendering as single design.");
          } else {
            var imgs = getImages(p);
            p.variants.forEach(function (v, vi) {
              if (!v.id) console.warn("[Quillart] Card " + p.id + ", variant " + vi + ": missing id.");
              if (!Array.isArray(v.imageIndexes) || v.imageIndexes.length === 0) {
                console.warn("[Quillart] Card " + p.id + ", variant " + vi + ": missing or empty imageIndexes.");
              } else {
                v.imageIndexes.forEach(function (idx) {
                  if (idx < 0 || idx >= imgs.length) {
                    console.warn("[Quillart] Card " + p.id + ", variant " + vi + ": imageIndex " + idx +
                      " out of range (images has " + imgs.length + " entries).");
                  }
                });
              }
            });
          }
        });

        injectItemListJsonLd();

        var params = parseHash();
        var filter = params.filter || "all";
        setActiveFilter(filter);

        if (params.item) {
          var item = products.find(function (p) {
            return p.id === params.item;
          });
          if (item) openLightbox(item);
        }
      })
      .catch(function (err) {
        gallery.innerHTML =
          '<p class="gallery-empty">Unable to load artworks. Please try again later.</p>';
        console.error(err);
      });

    filterChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        setActiveFilter(chip.dataset.filter);
      });
    });

    lightbox
      .querySelector(".lightbox-backdrop")
      .addEventListener("click", closeLightbox);
    lightbox
      .querySelector(".lightbox-close")
      .addEventListener("click", closeLightbox);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !lightbox.hidden) {
        closeLightbox();
      }
    });

    window.addEventListener("hashchange", function () {
      var params = parseHash();
      if (params.item) {
        var item = products.find(function (p) {
          return p.id === params.item;
        });
        if (item) openLightbox(item);
      } else if (!params.item && !lightbox.hidden) {
        closeLightbox();
      }

      var filter = params.filter || "all";
      if (
        filter !==
        (document.querySelector(".filter-chip.active") || {}).dataset.filter
      ) {
        setActiveFilter(filter);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

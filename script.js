(function () {
  "use strict";

  let products = [];
  const gallery = document.getElementById("gallery");
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const lightboxDetails = document.getElementById("lightbox-details");
  const filterChips = document.querySelectorAll(".filter-chip");
  const originalTitle = document.title;

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

  // --- Price display ---

  function cardPriceHtml(item) {
    var price = formatPrice(item.price, item.currency);
    if (isPriceFirm(item)) {
      return '<p class="card-price">' + price + "</p>";
    }
    return '<p class="card-price"><span class="price-from">from </span>' + price + "</p>";
  }

  function lightboxPriceHtml(item) {
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
    // sold
    return '<p class="lightbox-price">' + price + "</p>";
  }

  // --- Card & gallery ---

  function createCard(item) {
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
    if (item.status === "available") {
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
      '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.title) +
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
      gallery.appendChild(createCard(item));
    });

    // Append commission CTA banner at end of gallery
    var cta = document.createElement("div");
    cta.className = "gallery-cta-banner";
    cta.innerHTML =
      '<p>Don\'t see what you\'re looking for?</p>' +
      '<a href="commission.html" class="btn btn-primary">Commission a custom piece</a>';
    gallery.appendChild(cta);
  }

  // --- Lightbox ---

  function openLightbox(item) {
    lightboxImage.src = item.image;
    lightboxImage.alt = item.title;
    lightboxImage.style.display = "";
    lightboxImage.onerror = function () {
      this.style.display = "none";
    };

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

    lightboxDetails.innerHTML =
      '<h2 class="lightbox-title">' + escapeHtml(item.title) + "</h2>" +
      '<div class="lightbox-meta">' +
      "<span>" + escapeHtml(item.dimensions) + "</span>" +
      "<span>" + escapeHtml(item.medium) + "</span>" +
      "</div>" +
      lightboxPriceHtml(item) +
      statusHtml +
      '<p class="lightbox-description">' + escapeHtml(item.description) + "</p>" +
      actionHtml;

    lightbox.hidden = false;
    document.body.style.overflow = "hidden";

    var params = parseHash();
    params.item = item.id;
    setHash(params);
    document.title = item.title + " — Quill Art by TK";

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

    if (!firm) {
      offers.priceSpecification = {
        "@type": "PriceSpecification",
        price: item.price,
        priceCurrency: item.currency || "AUD",
        valueAddedTaxIncluded: true,
        description: "Guide price; final quote on enquiry"
      };
    }

    var ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.title,
      description: item.description,
      image: CONFIG.baseUrl + "/" + item.image,
      url: CONFIG.baseUrl + "/#item=" + item.id,
      brand: {
        "@type": "Brand",
        name: "Quill Art by TK"
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
      name: "Quill Art by TK — Artworks",
      numberOfItems: products.length,
      itemListElement: items
    };
    var el = document.getElementById("itemlist-jsonld");
    if (el) el.textContent = JSON.stringify(ld);
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
    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load products");
        return res.json();
      })
      .then(function (data) {
        products = data;
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

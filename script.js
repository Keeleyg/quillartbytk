(function () {
  "use strict";

  let products = [];
  const gallery = document.getElementById("gallery");
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const lightboxDetails = document.getElementById("lightbox-details");
  const filterChips = document.querySelectorAll(".filter-chip");
  const originalTitle = document.title;

  function parseHash() {
    const params = {};
    const hash = location.hash.slice(1);
    hash.split("&").forEach(function (part) {
      const [key, val] = part.split("=");
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || "");
    });
    return params;
  }

  function setHash(params) {
    const parts = [];
    Object.keys(params).forEach(function (key) {
      if (params[key]) parts.push(key + "=" + encodeURIComponent(params[key]));
    });
    const newHash = parts.length ? "#" + parts.join("&") : location.pathname;
    history.replaceState(null, "", newHash);
  }

  function getActiveFilter() {
    const params = parseHash();
    return params.filter || "all";
  }

  function formatPrice(price, currency) {
    return "$" + price.toLocaleString("en-AU") + " " + (currency || "AUD");
  }

  function buildMailtoLink(item) {
    var subject = "Enquiry: " + item.title + " (ID " + item.id + ")";
    var body =
      'Hi, I\'d like to purchase "' +
      item.title +
      '" (ID ' +
      item.id +
      ", " +
      formatPrice(item.price, item.currency) +
      "). Please send a Zeller Invoice to this email.\r\n\r\nShipping address:\r\n";
    return (
      "mailto:" +
      CONFIG.email +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body)
    );
  }

  function createCard(item) {
    var card = document.createElement("article");
    card.className = "card";
    card.dataset.status = item.status;
    card.dataset.id = item.id;

    var badgeHtml = "";
    if (item.status === "sold") {
      badgeHtml = '<span class="card-badge card-badge--sold">Sold</span>';
    } else if (item.status === "reserved") {
      badgeHtml =
        '<span class="card-badge card-badge--reserved">Reserved</span>';
    }

    var enquireHtml = "";
    if (item.status === "available") {
      enquireHtml =
        '<a href="' +
        buildMailtoLink(item) +
        '" class="btn btn-primary btn-enquire">Enquire to Purchase</a>';
    }

    card.innerHTML =
      '<div class="card-image-wrap" role="button" tabindex="0" aria-label="View ' +
      escapeHtml(item.title) +
      '">' +
      '<img src="' +
      escapeHtml(item.image) +
      '" alt="' +
      escapeHtml(item.title) +
      '" loading="lazy" onerror="this.style.display=\'none\';this.insertAdjacentHTML(\'afterend\',\'<div class=img-placeholder>Image coming soon</div>\')">' +
      badgeHtml +
      "</div>" +
      '<div class="card-body">' +
      '<h3 class="card-title">' +
      escapeHtml(item.title) +
      "</h3>" +
      '<p class="card-meta">' +
      escapeHtml(item.dimensions) +
      "</p>" +
      '<p class="card-price">' +
      formatPrice(item.price, item.currency) +
      "</p>" +
      enquireHtml +
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

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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
      gallery.innerHTML = '<p class="gallery-empty">No artworks to show.</p>';
      return;
    }

    filtered.forEach(function (item) {
      gallery.appendChild(createCard(item));
    });
  }

  function openLightbox(item) {
    lightboxImage.src = item.image;
    lightboxImage.alt = item.title;
    lightboxImage.onerror = function () {
      this.style.display = "none";
    };

    var statusHtml = "";
    if (item.status === "sold") {
      statusHtml =
        '<span class="lightbox-status-badge card-badge--sold">Sold</span>';
    } else if (item.status === "reserved") {
      statusHtml =
        '<span class="lightbox-status-badge card-badge--reserved">Reserved</span>';
    }

    var enquireHtml = "";
    if (item.status === "available") {
      enquireHtml =
        '<a href="' +
        buildMailtoLink(item) +
        '" class="btn btn-primary lightbox-enquire">Enquire to Purchase</a>';
    }

    lightboxDetails.innerHTML =
      '<h2 class="lightbox-title">' +
      escapeHtml(item.title) +
      "</h2>" +
      '<div class="lightbox-meta">' +
      "<span>" +
      escapeHtml(item.dimensions) +
      "</span>" +
      "<span>" +
      escapeHtml(item.medium) +
      "</span>" +
      "</div>" +
      '<p class="lightbox-price">' +
      formatPrice(item.price, item.currency) +
      "</p>" +
      statusHtml +
      '<p class="lightbox-description">' +
      escapeHtml(item.description) +
      "</p>" +
      enquireHtml;

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

  function injectProductJsonLd(item) {
    var ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.title,
      description: item.description,
      image: CONFIG.baseUrl + "/" + item.image,
      url: CONFIG.baseUrl + "/#item=" + item.id,
      brand: {
        "@type": "Brand",
        name: "Quill Art by TK",
      },
      offers: {
        "@type": "Offer",
        price: item.price,
        priceCurrency: item.currency || "AUD",
        availability:
          item.status === "available"
            ? "https://schema.org/InStock"
            : item.status === "reserved"
              ? "https://schema.org/LimitedAvailability"
              : "https://schema.org/SoldOut",
        url: CONFIG.baseUrl + "/#item=" + item.id,
      },
      material: item.medium,
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
        name: item.title,
      };
    });
    var ld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Quill Art by TK — Artworks",
      numberOfItems: products.length,
      itemListElement: items,
    };
    var el = document.getElementById("itemlist-jsonld");
    if (el) el.textContent = JSON.stringify(ld);
  }

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

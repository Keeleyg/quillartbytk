var CONFIG = {
  siteTitle: "Quillart by TK",
  tagline: "Handmade quilled paper artworks — unique pieces crafted with care",
  email: "hello@quillartbytk.com",
  baseUrl: "https://quillartbytk.com",
  social: {
    facebook: "https://www.facebook.com/quillartbytk"
  },
  defaultOgImage: "images/logo.jpg",
  currency: "AUD",
  defaultLeadTimeWeeks: 3,
  customCommissionLeadTime: "4-8 weeks",
  deposit: 0.5,
  cards: {
    defaultUnitPrice: 8,
    suggestBulkAt: 3
  },
  categories: [
    {id: "framed", label: "Framed"},
    {id: "clocks", label: "Clocks"},
    {id: "canvas", label: "Canvas"},
    {id: "cards", label: "Cards"},
    {id: "homewares", label: "Homewares"}
  ],
  themes: [
    {id: "birds", label: "Birds"},
    {id: "animals", label: "Animals"},
    {id: "insects", label: "Insects"},
    {id: "nautical", label: "Nautical"},
    {id: "flowers", label: "Flowers"},
    {id: "trees", label: "Trees"},
    {id: "nursery", label: "Nursery"},
    {id: "names", label: "Names"},
    {id: "patterns", label: "Patterns"}
  ],
  commission: {
    introBlurb: "Have something specific in mind? I can create a fully custom quilled artwork to your brief — any subject, size, colour palette, or format. Whether it's a gift, a memorial piece, or something to match your space, I'll work with you to bring your idea to life in paper.",
    leadTimeDisclaimer: "Lead times vary with complexity and current queue.",
    marketsBlurb: "Some of our favourite commissions have started as a chat at a market stall. If you'd rather discuss your idea face-to-face, come find us at one of these upcoming markets:"
  }
};

// Dynamic copyright year — updates any element with class "copyright-year"
document.addEventListener("DOMContentLoaded", function () {
  var els = document.querySelectorAll(".copyright-year");
  var year = new Date().getFullYear();
  for (var i = 0; i < els.length; i++) {
    els[i].textContent = year;
  }
});

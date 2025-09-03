(() => {
  const SCRIPT_VERSION = "1.2.0";

  // ——— اكتشاف السكربت والمصدر ———
  const CURRENT_SCRIPT = document.currentScript;
  const SCRIPT_ORIGIN = (() => {
    try { return new URL(CURRENT_SCRIPT?.src || location.href).origin; }
    catch { return location.origin; }
  })();

  const API_BASE = `${SCRIPT_ORIGIN}/api/public/reviews`;
  const LOGO_URL = `${SCRIPT_ORIGIN}/widgets/logo.png`;

  // ——— Helpers ———
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach((c) => (typeof c === "string" ? el.appendChild(document.createTextNode(c)) : el.appendChild(c)));
    return el;
  };
  const Stars = (n = 0) => {
    const wrap = h("div", { class: "stars", role: "img", "aria-label": `${n} stars` });
    for (let i = 1; i <= 5; i++) wrap.appendChild(h("span", { class: "star" + (i <= n ? " filled" : "") }, "★"));
    return wrap;
  };

  // ——— اكتشاف Product ID من الصفحة (بدون تعديل القالب) ———
  function detectProductId() {
    // 1) JSON-LD: ابحث عن @type:Product
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.textContent || "null");
          const arr = Array.isArray(json) ? json : [json];
          for (const node of arr) {
            if (!node) continue;
            if (node["@type"] === "Product" || (Array.isArray(node["@type"]) && node["@type"].includes("Product"))) {
              // productID أو sku أو url به id
              const pid = node.productID || node.productId || node.sku || null;
              if (pid) return String(pid);
              if (node.url) {
                const m = String(node.url).match(/(\d{5,})/);
                if (m) return m[1];
              }
            }
          }
        } catch {}
      }
    } catch {}

    // 2) عناصر DOM شائعة
    const domHints = [
      "[data-product-id]",
      "[data-productid]",
      '[itemtype*="Product"] [itemprop="sku"]',
      '[itemtype*="Product"] [itemprop="productID"]',
      ".product-id",
      "#product-id",
    ];
    for (const sel of domHints) {
      const el = document.querySelector(sel);
      const v = el?.getAttribute?.("data-product-id")
        || el?.getAttribute?.("data-productid")
        || el?.textContent
        || el?.getAttribute?.("content");
      if (v && /\S/.test(v)) return String(v).trim();
    }

    // 3) URL Heuristics (لو سلة بتضيف رقم المنتج في اللينك)
    const url = location.pathname;
    const matchers = [
      /-(\d{5,})$/,                // ...-123456
      /\/p\/(\d{5,})(?:\/|$)/,     // /p/123456
      /\/products\/(\d{5,})/,      // /products/123456
    ];
    for (const rgx of matchers) {
      const m = url.match(rgx);
      if (m) return m[1];
    }

    // لم نجد شيء
    return null;
  }

  // ——— إيجاد مكان مناسب أسفل صفحة المنتج ———
  function findProductMountPoint() {
    // حاول بعد صندوق التفاصيل/الوصف
    const candidates = [
      ".product-details",
      ".product-show",
      ".product-single",
      ".product__details",
      ".product-info",
      ".product-main",
      "#product-show",
      "#product",
      "main .container"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.body; // fallback
  }

  async function mountOne(hostEl, store, productId, limit, lang, theme) {
    const root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;

    const style = h("style", {
      html: `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .wrap { font-family: system-ui,-apple-system,Segoe UI,Tahoma,Arial,sans-serif; direction: ${lang === "ar" ? "rtl" : "ltr"}; }
        .section { background:${theme === "dark" ? "#0b1324" : "#fff"};
                   color:${theme === "dark" ? "#e2e8f0" : "#0f172a"};
                   border:1px solid ${theme === "dark" ? "#24304a" : "#e5e7eb"};
                   border-radius:14px; padding:14px; margin:10px 0; }
        .header { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
        .logo { width:20px; height:20px; }
        .title { font-weight:700; font-size:14px; margin:0; }
        .meta { font-size:12px; opacity:.75; margin:0 0 8px 0; }
        .stars { color:#f59e0b; letter-spacing:2px; font-size:14px; }
        .star { opacity:.35; } .star.filled { opacity:1; }
        .badge { display:inline-flex; align-items:center; gap:6px; background:#e6f4ea; color:#166534; border:1px solid #86efac;
                 font-size:11px; padding:3px 8px; border-radius:999px; }
        .badge.dark { background:#064e3b; color:#bbf7d0; border-color:#10b981; }
        .text { white-space:pre-wrap; line-height:1.6; font-size:13px; margin:8px 0 0 0; }
        .empty { padding:12px; border:1px dashed ${theme === "dark" ? "#374151" : "#94a3b8"}; border-radius:12px; font-size:13px; opacity:.8; }
        .row { display:flex; align-items:center; gap:8px; justify-content:space-between; }
        .left { display:flex; align-items:center; gap:8px; }
        .item { background:${theme === "dark" ? "#0f172a" : "#fff"};
                color:inherit; border:1px solid ${theme === "dark" ? "#334155" : "#e2e8f0"};
                border-radius:14px; padding:14px; margin:10px 0; }
        .filter { display:flex; align-items:center; gap:8px; margin:10px 0 0; font-size:12px; opacity:.8 }
        .filter button { padding:6px 10px; border-radius:8px; border:1px solid ${theme === "dark" ? "#334155" : "#cbd5e1"};
                         background:transparent; color:inherit; cursor:pointer; }
        .filter button.active { background:${theme === "dark" ? "#1f2937" : "#f1f5f9"}; }
      `,
    });

    const titleText = productId
      ? (lang === "ar" ? "آراء المشترين" : "Customer Reviews")
      : (lang === "ar" ? "تقييمات المتجر" : "Store Reviews");

    const container = h("div", { class: "wrap" });
    const section = h("div", { class: "section" }, [
      h("div", { class: "header" }, [
        h("img", { class: "logo", src: LOGO_URL, alt: "Theqah" }),
        h("p", { class: "title" }, titleText),
      ]),
      productId ? h("p", { class: "meta" }, `${lang === "ar" ? "رقم المنتج" : "Product"}: ${productId}`) : null,
      h("div", { class: "list" }, lang === "ar" ? "…جاري التحميل" : "Loading…"),
      h("div", { class: "filter" }, [
        h("span", {}, lang === "ar" ? "الترتيب:" : "Sort:"),
        h("button", { "data-sort": "desc", class: "active" }, lang === "ar" ? "الأحدث" : "Newest"),
        h("button", { "data-sort": "asc" }, lang === "ar" ? "الأقدم" : "Oldest"),
      ]),
    ]);

    container.appendChild(section);
    root.appendChild(style);
    root.appendChild(container);

    const filterEl = section.querySelector(".filter");
    const list = section.querySelector(".list");
    let currentSort = "desc";
    let lastData = null;

    filterEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      currentSort = btn.getAttribute("data-sort") || "desc";
      filterEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderList(lastData);
    });

    const endpointBase =
      `${API_BASE}?storeUid=${encodeURIComponent(store)}&limit=${limit}&sinceDays=365}`.replace(/}$/, "");
    const endpoint = productId ? `${endpointBase}&productId=${encodeURIComponent(productId)}` : endpointBase;

    const fetchData = async () => {
      try {
        const res = await fetch(`${endpoint}&sort=${currentSort}`, {
          headers: { "x-theqah-widget": SCRIPT_VERSION },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        lastData = await res.json();
        renderList(lastData);
      } catch (e) {
        list.innerHTML = "";
        list.appendChild(h("div", { class: "empty" }, lang === "ar" ? "تعذّر التحميل" : "Failed to load"));
      }
    };

    const renderList = (data) => {
      list.innerHTML = "";
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        list.appendChild(h("div", { class: "empty" }, lang === "ar" ? "لا توجد تقييمات بعد" : "No reviews yet"));
        return;
      }
      items.sort((a, b) =>
        currentSort === "asc"
          ? Number(a.publishedAt || 0) - Number(b.publishedAt || 0)
          : Number(b.publishedAt || 0) - Number(a.publishedAt || 0)
      );

      for (const r of items) {
        const when = r.publishedAt ? new Date(r.publishedAt).toLocaleDateString(lang === "ar" ? "ar" : "en") : "";
        const trusted = !!r.trustedBuyer;
        const row = h("div", { class: "row" }, [
          h("div", { class: "left" }, [
            Stars(Number(r.stars || 0)),
            trusted ? h("span", { class: "badge" + (theme === "dark" ? " dark" : "") }, lang === "ar" ? "مشتري موثّق" : "Verified Buyer") : null,
          ]),
          h("small", { class: "meta" }, when),
        ]);
        const text = h("p", { class: "text" }, String(r.text || "").trim());
        list.appendChild(h("div", { class: "item" }, [row, text]));
      }
    };

    await fetchData();
  }

  function mountAll() {
    // اقرأ الإعدادات من الوسوم / أو استخرج المنتج
    const store = CURRENT_SCRIPT?.dataset.store?.trim();
    const lang  = (CURRENT_SCRIPT?.dataset.lang || "ar").toLowerCase();
    const theme = (CURRENT_SCRIPT?.dataset.theme || "light").toLowerCase();
    const limit = Number(CURRENT_SCRIPT?.dataset.limit || 10);

    if (!store) return;

    // اكتشف إن كانت الصفحة صفحة منتج
    const pid = detectProductId();

    // ابحث عن مكان مناسب داخل صفحة المنتج؛ إن لم يوجد، استخدم body
    const host = document.querySelector("#theqah-reviews, .theqah-reviews") || findProductMountPoint();
    const mountEl = host === document.body ? h("div", { class: "theqah-reviews" }) : host;
    if (host === document.body) {
      const target = findProductMountPoint();
      target.appendChild(mountEl);
    }

    // ! لا تكرار
    if (mountEl.getAttribute("data-mounted") === "1") return;
    mountEl.setAttribute("data-mounted", "1");

    // نفّذ
    mountOne(mountEl, store, pid, limit, lang, theme);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();

  // لو الصفحة SPA أو فيها تحميل ديناميكي
  const obs = new MutationObserver(() => mountAll());
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();

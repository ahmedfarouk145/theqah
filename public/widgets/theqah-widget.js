
(() => {
  const SCRIPT_VERSION = "1.3.3";

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

  // ——— Cache/Single-flight لنتيجة الـ resolveStore ———
  const G = (window.__THEQAH__ = window.__THEQAH__ || {});
  const TTL_MS = 10 * 60 * 1000; // 10 دقائق

  function cacheKey(host){ return `theqah:storeUid:${host}`; }
  function getCached(host){
    try {
      const o = JSON.parse(localStorage.getItem(cacheKey(host)) || '{}');
      if (o.uid && (Date.now() - (o.t || 0) < TTL_MS)) return o.uid;
    } catch {}
    return null;
  }
  function setCached(host, uid){
    try { localStorage.setItem(cacheKey(host), JSON.stringify({ uid, t: Date.now() })); } catch {}
  }

  // ——— Store Resolution ———
  async function resolveStore() {
    const host = location.host.replace(/^www\./, '').toLowerCase();

    // ذاكرة و localStorage
    if (G.storeUid) return G.storeUid;
    const cached = getCached(host);
    if (cached) { G.storeUid = cached; return cached; }

    // Single-flight
    if (G.resolvePromise) return G.resolvePromise;

    const url = `${API_BASE}/resolve?host=${encodeURIComponent(host)}&v=${encodeURIComponent(SCRIPT_VERSION)}`;
    G.resolvePromise = fetch(url, { cache: 'no-store' }) // بدون هيدرات مخصّصة لتفادي OPTIONS
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const uid = j?.storeUid || null;
        if (uid) { G.storeUid = uid; setCached(host, uid); }
        return uid;
      })
      .finally(() => { G.resolvePromise = null; });

    return G.resolvePromise;
  }

  // ——— اكتشاف Product ID من الصفحة (سلة) ———
  function detectProductId() {
    // من المضيف لو محدد
    const host = document.querySelector("#theqah-reviews, .theqah-reviews");
    const hostPid = host?.getAttribute("data-product") || host?.dataset?.product;
    if (hostPid && /\S/.test(hostPid) && hostPid !== "auto") return String(hostPid).trim();

    // JSON-LD
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.textContent || "null");
          const arr = Array.isArray(json) ? json : [json];
          for (const node of arr) {
            if (!node) continue;
            if (node["@type"] === "Product" || (Array.isArray(node["@type"]) && node["@type"].includes("Product"))) {
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

    // DOM hints
    const domHints = [
      "[data-product-id]","[data-productid]",
      '[itemtype*="Product"] [itemprop="sku"]','[itemtype*="Product"] [itemprop="productID"]',
      ".product-id","#product-id"
    ];
    for (const sel of domHints) {
      const el = document.querySelector(sel);
      const v = el?.getAttribute?.("data-product-id")
        || el?.getAttribute?.("data-productid")
        || el?.textContent
        || el?.getAttribute?.("content");
      if (v && /\S/.test(v)) return String(v).trim();
    }

    // URL Heuristics (سلة)
    const url = location.pathname;
    const matchers = [
      /\/p(\d{8,})(?:\/|$)/,       // /p1927638714
      /-(\d{8,})$/,                // ...-1927638714
      /\/products\/(\d{8,})/,      // /products/1927638714
    ];
    for (const rgx of matchers) {
      const m = url.match(rgx);
      if (m) return m[1];
    }
    return null;
  }

  // ——— إيجاد سكشن المنتج وحقن المضيف ———
  function findProductAnchor() {
    const fromData = document.querySelector("[data-product-id], [data-productid]");
    if (fromData) {
      const sec = fromData.closest("section, .product, .product-page, .product__details, .product-single, .product-show");
      if (sec) return sec;
    }
    const candidates = [
      ".product__details",".product-show",".product-single",".product-details",
      ".product-info",".product-main","#product-show","#product","main .container"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.body;
  }

  function ensureHostUnderProduct() {
    let host = document.querySelector("#theqah-reviews, .theqah-reviews");
    if (host) return host;

    const anchor = findProductAnchor();
    host = document.createElement("div");
    host.className = "theqah-reviews";
    host.style.marginTop = "24px";
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(host, anchor.nextSibling);
    } else {
      document.body.appendChild(host);
    }
    return host;
  }

  async function mountOne(hostEl, store, productId, limit, lang, theme) {
    // لو بالفعل مُركّب بنجاح — اخرج
    if (hostEl.getAttribute("data-state") === "done") return;

    // امنع التكرار أثناء الـmount
    if (hostEl.getAttribute("data-state") === "mounting") return;
    hostEl.setAttribute("data-state", "mounting");

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
        .loading { text-align:center; padding:20px; opacity:.6; }
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
      h("div", { class: "list loading" }, lang === "ar" ? "…جاري التحميل" : "Loading…"),
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

    const base = `${API_BASE}?storeUid=${encodeURIComponent(store)}&limit=${encodeURIComponent(String(limit))}&sinceDays=365`;
    const endpoint = productId ? `${base}&productId=${encodeURIComponent(productId)}` : base;

    const fetchData = async () => {
      try {
        const url = `${endpoint}&sort=${currentSort}&v=${encodeURIComponent(SCRIPT_VERSION)}&_=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' }); // Simple request => لا OPTIONS
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        lastData = await res.json();
        renderList(lastData);
        // نجاح — علّم done
        hostEl.setAttribute("data-state", "done");
      } catch (e) {
        console.error('Failed to fetch reviews:', e);
        list.innerHTML = "";
        list.appendChild(h("div", { class: "empty" }, lang === "ar" ? "تعذّر التحميل" : "Failed to load"));
        // ما نعلّمش done علشان نقدر نعيد المحاولة لاحقًا
        hostEl.removeAttribute("data-state");
      }
    };

    const renderList = (data) => {
      list.innerHTML = "";
      list.classList.remove("loading");
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        list.appendChild(h("div", { class: "empty" }, lang === "ar" ? "لا توجد تقييمات بعد — كن أول من يقيّم!" : "No reviews yet — be the first!"));
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

  // ——— Main mounting (مع Debounce) ———
  async function mountAll() {
    const existingHost = document.querySelector("#theqah-reviews, .theqah-reviews");

    // قراءة الإعدادات
    let store =
      existingHost?.getAttribute("data-store") ||
      existingHost?.dataset?.store ||
      CURRENT_SCRIPT?.dataset?.store ||
      "";

    const lang =
      existingHost?.getAttribute?.("data-lang") ||
      existingHost?.dataset?.lang ||
      CURRENT_SCRIPT?.dataset?.lang ||
      "ar";

    const theme =
      existingHost?.getAttribute?.("data-theme") ||
      existingHost?.dataset?.theme ||
      CURRENT_SCRIPT?.dataset?.theme ||
      "light";

    const limit = Number(
      existingHost?.getAttribute?.("data-limit") ||
      existingHost?.dataset?.limit ||
      CURRENT_SCRIPT?.dataset?.limit ||
      10
    ) || 10;

    // تنظيف store من placeholders
    if (store && (store.includes('{') || /STORE_ID/i.test(store))) {
      console.warn('Store ID contains placeholder, clearing:', store);
      store = '';
    }

    // Auto-resolve لو مش متوفر
    if (!store) {
      try {
        store = await resolveStore();
      } catch (err) {
        console.error('Error during store auto-resolution:', err);
      }
    }

    // لو لسه مفيش ستور — اعرض رسالة لكن من غير data-state="done"
    const host = existingHost || ensureHostUnderProduct();
    if (!store) {
      if (!host.querySelector('.theqah-widget-empty')) {
        const msg = document.createElement("div");
        msg.className = "theqah-widget-empty";
        msg.style.cssText = "padding:12px;border:1px dashed #94a3b8;border-radius:12px;opacity:.8;font:13px system-ui;";
        msg.textContent = (String(lang).toLowerCase() === "ar")
          ? "لم يتم العثور على معرف المتجر. سيُعاد المحاولة تلقائيًا."
          : "Store ID not found. Will retry automatically.";
        host.appendChild(msg);
      }
      return;
    }

    // productId
    const pidFromHost = host?.getAttribute("data-product") || host?.dataset?.product || null;
    const pid = (pidFromHost && pidFromHost !== "auto") ? pidFromHost : detectProductId();

    // نفّذ
    await mountOne(host, store, pid, limit, String(lang).toLowerCase(), String(theme).toLowerCase());
  }

  // Debounce للتركيب
  let mountScheduled = false;
  function scheduleMount(){
    if (mountScheduled) return;
    mountScheduled = true;
    setTimeout(async () => {
      mountScheduled = false;
      await mountAll();
    }, 150);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleMount);
  } else {
    scheduleMount();
  }

  // دعم SPA
  const obs = new MutationObserver(() => scheduleMount());
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();


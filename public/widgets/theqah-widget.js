
(() => {
  const SCRIPT_VERSION = "1.3.12";

  // ——— تحديد السكربت والمصدر ———
  const CURRENT_SCRIPT = document.currentScript;
  const SCRIPT_ORIGIN = (() => {
    try { return new URL(CURRENT_SCRIPT?.src || location.href).origin; }
    catch { return location.origin; }
  })();

  const API_BASE = `${SCRIPT_ORIGIN}/api/public/reviews`;
  const LOGO_URL = `${SCRIPT_ORIGIN}/widgets/logo.png?v=3`; // تفادي الكاش

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

  // ——— Cache/Single-flight لنتيجة resolveStore ———
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

  async function resolveStore() {
    const host = location.host.replace(/^www\./, '').toLowerCase();

    // ذاكرة + localStorage
    if (G.storeUid) return G.storeUid;
    const cached = getCached(host);
    if (cached) { G.storeUid = cached; return cached; }

    // single-flight
    if (G.resolvePromise) return G.resolvePromise;

    const url = `${API_BASE}/resolve?host=${encodeURIComponent(host)}&href=${encodeURIComponent(location.href)}&v=${encodeURIComponent(SCRIPT_VERSION)}`;
    G.resolvePromise = fetch(url, { cache: 'no-store' }) // طلب بسيط بدون هيدر مخصّص لتفادي OPTIONS
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const uid = j?.storeUid || null;
        if (uid) { G.storeUid = uid; setCached(host, uid); }
        return uid;
      })
      .finally(() => { G.resolvePromise = null; });

    return G.resolvePromise;
  }

  // ——— اكتشاف Product ID (سلة) ———
  function detectProductId() {
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

    // URL Heuristics لسلة - تحسين Pattern matching
    const url = location.pathname;
    const matchers = [
      /\/p(\d{7,})(?:\/|$)/,    // /p1927638714
      /-(\d{7,})$/,             // ...-1927638714  
      /\/products\/(\d{7,})/,   // /products/1927638714
      /\/product\/(\d{7,})/,    // /product/1927638714
      /\/(\d{7,})$/,            // /1927638714
    ];
    for (const rgx of matchers) {
      const m = url.match(rgx);
      if (m) return m[1];
    }
    
    // فحص query parameters
    const urlParams = new URLSearchParams(location.search);
    const productParam = urlParams.get('product') || urlParams.get('id') || urlParams.get('pid');
    if (productParam && /^\d{7,}$/.test(productParam)) {
      return productParam;
    }
    
    return null;
  }

  // ——— إدراج الحاوية أسفل سكشن المنتج ———
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

  // ——— تركيب وrender ———
  async function mountOne(hostEl, store, productId, limit, lang, theme) {
    // حراسة ضد التكرار
    if (hostEl.getAttribute("data-state") === "done") return;
    if (hostEl.getAttribute("data-state") === "mounting") return;
    hostEl.setAttribute("data-state", "mounting");
    
    // إضافة class للـ host element
    hostEl.classList.add("theqah-reviews");

    // استخدام hostEl مباشرة بدلاً من Shadow DOM لتجنب مشاكل event listeners
    const root = hostEl;
    const style = h("style", {
      html: `
        .theqah-reviews * { box-sizing: border-box; }
        .theqah-reviews { font-family: system-ui; display: block; }
        
        .theqah-reviews .wrap { 
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Noto Sans,Liberation Sans,Arial,sans-serif; 
          direction: ${lang === "ar" ? "rtl" : "ltr"}; 
          line-height: 1.5;
          color: ${theme === "dark" ? "#f1f5f9" : "#1e293b"};
        }
        
        .theqah-reviews .section { 
          background: ${theme === "dark" 
            ? "linear-gradient(135deg, #0f1629 0%, #1e293b 100%)" 
            : "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)"};
          color: ${theme === "dark" ? "#f1f5f9" : "#1e293b"};
          border: 1px solid ${theme === "dark" ? "rgba(71, 85, 105, 0.3)" : "rgba(226, 232, 240, 0.8)"};
          border-radius: 20px; 
          padding: 32px; 
          margin: 24px 0; 
          box-shadow: ${theme === "dark" 
            ? "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)" 
            : "0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)"};
          backdrop-filter: blur(12px);
          position: relative;
          overflow: hidden;
        }
        
        .section::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, 
            transparent 0%, 
            ${theme === "dark" ? "rgba(148, 163, 184, 0.3)" : "rgba(59, 130, 246, 0.3)"} 50%, 
            transparent 100%);
        }
        
        .header { 
          display: flex; 
          align-items: center; 
          gap: 16px; 
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid ${theme === "dark" ? "rgba(71, 85, 105, 0.3)" : "rgba(226, 232, 240, 0.5)"};
        }
        
        /* ——— لوجو الهيدر: ثابت (لا تغيير إضافي) ——— */
        .logo { 
          width: 96px; 
          height: 96px; 
          border-radius: 10px;
          padding: 10px;
          background: ${theme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.08)"};
          transition: all 0.25s ease;
        }
        .logo:hover { transform: scale(1.03); }
        
        .title { 
          font-weight: 700; 
          font-size: 22px; 
          margin: 0;
          background: ${theme === "dark" 
            ? "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)" 
            : "linear-gradient(135deg, #1e293b 0%, #475569 100%)"};
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.025em;
        }
        
        .meta { 
          font-size: 14px; 
          opacity: 0.75; 
          margin: 0 0 12px 0;
          font-weight: 500;
          color: ${theme === "dark" ? "#94a3b8" : "#64748b"};
        }
        
        .count { 
          font-size: 16px; 
          font-weight: 600;
          margin: 0 0 24px 0;
          color: ${theme === "dark" ? "#10b981" : "#059669"};
        }

        /* ——— النجوم (تكبير + 3D) ——— */
        .stars { 
          color: #f59e0b; 
          letter-spacing: 1px; 
          font-size: 40px;            /* ← تكبير النجوم */
          filter: drop-shadow(0 1px 2px rgba(245, 158, 11, 0.2));
          display: inline-flex;
          gap: 6px;
        }
        .star { 
          opacity: 0.5; 
          transition: transform 0.2s ease, text-shadow 0.2s ease, opacity .2s ease;
          color: #fcd34d; 
          text-shadow:
            0 2px 4px rgba(0,0,0,0.5),              /* ظل خارجي */
            0 -1px 2px rgba(255,255,255,0.6);       /* لمعة أعلى */
          transform: perspective(220px) translateZ(0);
        } 
        .star.filled { 
          opacity: 1;
          color: #fbbf24;
          text-shadow:
            0 3px 6px rgba(0,0,0,0.6),
            0 -1px 2px rgba(255,255,255,0.85),
            0 0 8px rgba(251,191,36,0.7);           /* لمعة ذهبية إضافية */
        }
        .star.filled:hover {
          transform: perspective(220px) translateZ(10px) scale(1.18);  /* يطلع لبرا */
          text-shadow:
            0 6px 12px rgba(0,0,0,0.7),
            0 -2px 3px rgba(255,255,255,0.9),
            0 0 14px rgba(251,191,36,0.95);
        }
        
        /* ——— البادج الكبير بجوار التقييم ——— */
        .badge { 
          display: inline-flex; 
          align-items: center; 
          gap: 14px; 
          background: ${theme === "dark" 
            ? "linear-gradient(135deg, #059669 0%, #10b981 100%)" 
            : "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"};
          color: ${theme === "dark" ? "#ecfdf5" : "#065f46"};
          border: 2px solid ${theme === "dark" ? "rgba(16, 185, 129, 0.35)" : "#86efac"};
          font-size: 22px;        /* ← خط كبير */
          font-weight: 900;       /* Bold قوي */
          padding: 14px 22px;     /* بادج كبير */
          border-radius: 34px;
          box-shadow: ${theme === "dark" 
            ? "0 6px 12px -3px rgba(0,0,0,.35)" 
            : "0 6px 12px -3px rgba(0,0,0,.08)"};
          white-space: nowrap;
        }
        .badge-logo { 
          width: 70px !important;   /* ← اللوجو 70px */
          height: 70px !important; 
          display: block; 
          object-fit: contain;
          border-radius: 10px;
          background: rgba(255,255,255,0.25);
          padding: 4px;
          box-sizing: content-box;
        }
        .badge .label { letter-spacing: .2px; font-size: 22px; font-weight: 900; }
        
        .text { 
          white-space: pre-wrap; 
          line-height: 1.7; 
          font-size: 15px; 
          margin: 16px 0 0 0;
          color: ${theme === "dark" ? "#e2e8f0" : "#374151"};
          letter-spacing: -0.01em;
        }
        
        .empty { 
          padding: 32px; 
          border: 2px dashed ${theme === "dark" ? "#475569" : "#cbd5e1"}; 
          border-radius: 16px; 
          font-size: 15px; 
          opacity: 0.8;
          text-align: center;
          background: ${theme === "dark" ? "rgba(15, 23, 42, 0.3)" : "rgba(248, 250, 252, 0.5)"};
        }
        
        .row { 
          display: flex; 
          align-items: center; 
          gap: 12px; 
          justify-content: space-between;
          flex-wrap: wrap;
        }
        
        .left { 
          display: flex; 
          align-items: center; 
          gap: 12px;
          flex-wrap: wrap;
        }
        
        .item { 
          background: ${theme === "dark" 
            ? "linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.4) 100%)" 
            : "linear-gradient(135deg, #ffffff 0%, rgba(248, 250, 252, 0.8) 100%)"};
          color: inherit; 
          border: 1px solid ${theme === "dark" ? "rgba(71, 85, 105, 0.3)" : "rgba(226, 232, 240, 0.6)"};
          border-radius: 18px; 
          padding: 24px; 
          margin: 16px 0;
          box-shadow: ${theme === "dark" 
            ? "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)" 
            : "0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(255, 255, 255, 0.1)"}; 
          backdrop-filter: blur(8px);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          animation: slideInUp 0.5s ease-out forwards;
          opacity: 0;
          transform: translateY(20px);
        }
        
        .item::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, 
            transparent, 
            ${theme === "dark" ? "rgba(255, 255, 255, 0.03)" : "rgba(59, 130, 246, 0.03)"} , 
            transparent);
          transition: left 0.6s;
        }
        
        .item:hover::before { left: 100%; }
        
        .item:hover {
          transform: translateY(-2px);
          border-color: ${theme === "dark" ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.2)"}; 
          box-shadow: ${theme === "dark" 
            ? "0 20px 40px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(59, 130, 246, 0.1)" 
            : "0 20px 40px -10px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(59, 130, 246, 0.1)"}; 
        }
        
        .filter { 
          display: flex; 
          align-items: center; 
          gap: 12px; 
          margin: 24px 0 0; 
          font-size: 14px; 
          font-weight: 500;
          flex-wrap: wrap;
        }
        
        .filter span { color: ${theme === "dark" ? "#94a3b8" : "#64748b"}; }
        
        .filter button { 
          padding: 10px 20px; 
          border-radius: 12px; 
          border: 1px solid ${theme === "dark" ? "rgba(71, 85, 105, 0.4)" : "rgba(203, 213, 225, 0.8)"}; 
          background: ${theme === "dark" ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.8)"}; 
          color: inherit; 
          cursor: pointer;
          font-weight: 500;
          font-size: 13px;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }
        
        .filter button:hover {
          transform: translateY(-1px);
          border-color: ${theme === "dark" ? "rgba(59, 130, 246, 0.4)" : "rgba(59, 130, 246, 0.3)"}; 
          background: ${theme === "dark" ? "rgba(30, 41, 59, 0.8)" : "rgba(248, 250, 252, 0.9)"}; 
          box-shadow: ${theme === "dark" 
            ? "0 4px 12px -2px rgba(0, 0, 0, 0.3)" 
            : "0 4px 12px -2px rgba(0, 0, 0, 0.05)"}; 
        }
        
        .filter button.active { 
          background: ${theme === "dark" 
            ? "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" 
            : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"}; 
          color: white;
          border-color: ${theme === "dark" ? "#1d4ed8" : "#2563eb"}; 
          box-shadow: ${theme === "dark" 
            ? "0 8px 20px -4px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(59, 130, 246, 0.2)" 
            : "0 8px 20px -4px rgba(59, 130, 246, 0.3), 0 0 0 1px rgba(59, 130, 246, 0.1)"}; 
        }
        
        .filter button.active:hover {
          transform: translateY(-2px);
          box-shadow: ${theme === "dark" 
            ? "0 12px 24px -6px rgba(59, 130, 246, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.3)" 
            : "0 12px 24px -6px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(59, 130, 246, 0.2)"}; 
        }
        

        
        .loading { 
          text-align: center; 
          padding: 48px 20px; 
          opacity: 0.7;
          font-size: 16px;
          color: ${theme === "dark" ? "#94a3b8" : "#64748b"};
        }
        
        .loading::after {
          content: '';
          display: inline-block;
          width: 20px;
          height: 20px;
          margin-left: 12px;
          border: 2px solid ${theme === "dark" ? "#475569" : "#cbd5e1"};
          border-radius: 50%;
          border-top-color: ${theme === "dark" ? "#3b82f6" : "#3b82f6"};
          animation: spin 1s linear infinite;
          vertical-align: middle;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
          .section { padding: 20px; border-radius: 16px; margin: 16px 0; }
          .title { font-size: 18px; }
          .item { padding: 18px; border-radius: 14px; }
          .filter { gap: 8px; }
          .filter button { padding: 8px 14px; font-size: 12px; }
          .row { flex-direction: column; align-items: flex-start; gap: 8px; }
        }
        
        /* Animation for new items */
        @keyframes slideInUp { to { opacity: 1; transform: translateY(0); } }
        .item:nth-child(1) { animation-delay: 0.1s; }
        .item:nth-child(2) { animation-delay: 0.2s; }
        .item:nth-child(3) { animation-delay: 0.3s; }
        .item:nth-child(4) { animation-delay: 0.4s; }
        .item:nth-child(5) { animation-delay: 0.5s; }
      `,
    });

    const titleText = productId
      ? (lang === "ar" ? "تقييمات هذا المنتج" : "Product Reviews")
      : (lang === "ar" ? "جميع تقييمات المتجر" : "All Store Reviews");

    const section = h("div", { class: "section" }, [
      h("div", { class: "header" }, [
        h("img", { class: "logo", src: LOGO_URL, alt: "Theqah" }),
        h("p", { class: "title" }, titleText),
      ]),
      productId ? h("p", { class: "meta" }, `${lang === "ar" ? "رقم المنتج" : "Product"}: ${productId}`) : null,
      h("p", { class: "count" }, ""),
      h("div", { class: "list loading" }, lang === "ar" ? "…جاري التحميل" : "Loading…"),
      h("div", { class: "filter" }, [
        h("span", {}, lang === "ar" ? "الترتيب:" : "Sort:"),
        h("button", { "data-sort": "desc", class: "active" }, lang === "ar" ? "الأحدث" : "Newest"),
        h("button", { "data-sort": "asc" }, lang === "ar" ? "الأقدم" : "Oldest"),
      ]),
    ]);

    const container = h("div", { class: "wrap" });
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
      fetchData();
    });

    const base = `${API_BASE}?storeUid=${encodeURIComponent(store)}&limit=1000&sinceDays=365`;
    const endpoint = productId ? `${base}&productId=${encodeURIComponent(productId)}` : base;

    const fetchData = async () => {
      try {
        // إظهار loading أثناء التحميل
        list.innerHTML = "";
        list.classList.add("loading");
        list.appendChild(h("div", { class: "loading" }, lang === "ar" ? "...جاري التحميل" : "Loading..."));
        
        const url = `${endpoint}&sort=${currentSort}&v=${encodeURIComponent(SCRIPT_VERSION)}&_=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' }); // طلب بسيط => بدون preflight
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        lastData = await res.json();
        renderList(lastData);
        hostEl.setAttribute("data-state", "done"); // نجاح
      } catch (e) {
        console.error('Failed to fetch reviews:', e);
        list.innerHTML = "";
        list.classList.remove("loading");
        list.appendChild(h("div", { class: "empty" }, lang === "ar" ? "تعذّر التحميل" : "Failed to load"));
        hostEl.removeAttribute("data-state"); // تسمح بإعادة المحاولة لاحقًا
      }
    };

    const renderList = (data) => {
      list.innerHTML = "";
      list.classList.remove("loading");
      const items = Array.isArray(data?.items) ? data.items : [];
      
      // تحديث عداد التقييمات
      const countEl = section.querySelector(".count");
      if (countEl) {
        const countText = items.length === 0 ? 
          (lang === "ar" ? "لا توجد تقييمات بعد" : "No reviews yet") :
          (lang === "ar" ? `${items.length} تقييم` : `${items.length} review${items.length !== 1 ? 's' : ''}`);
        countEl.textContent = countText;
      }
      
      if (!items.length) {
        list.appendChild(h("div", { class: "empty" }, lang === "ar" ? "كن أول من يقيّم!" : "be the first!"));
        return;
      }
      // البيانات مرتبة مسبقاً من السيرفر، لا نحتاج ترتيب محلي
      for (const r of items) {
        const when = r.publishedAt ? new Date(r.publishedAt).toLocaleDateString(lang === "ar" ? "ar" : "en") : "";
        const trusted = !!r.trustedBuyer;

        const rowLeftChildren = [
          Stars(Number(r.stars || 0)),
          trusted
            ? h("span", { class: "badge", title: (lang === "ar" ? "مشتري موثّق" : "Verified Buyer") }, [
                h("img", {
                  class: "badge-logo",
                  src: LOGO_URL,
                  alt: (lang === "ar" ? "مشتري موثّق" : "Verified Buyer"),
                  loading: "lazy"
                }),
                h("span", { class: "label" }, "مشتري موثق")
              ])
            : null,
        ];

        const row = h("div", { class: "row" }, [
          h("div", { class: "left" }, rowLeftChildren),
          h("small", { class: "meta" }, when),
        ]);

        const text = h("p", { class: "text" }, String(r.text || "").trim());
        list.appendChild(h("div", { class: "item" }, [row, text]));
      }
    };



    await fetchData();
  }

  // ——— Main mounting مع حراسة و Debounce للـ SPA ———
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  let mountedOnce = false;
  let lastHref = location.href;

  const safeMount = async () => {
    // ما تعيدش التركيب على نفس الـ URL
    if (mountedOnce && lastHref === location.href) return;
    lastHref = location.href;

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

    // تنظيف placeholder
    if (store && (store.includes('{') || /STORE_ID/i.test(store))) {
      console.warn('❌ Store ID is still a placeholder:', store);
      console.warn('📝 Please replace {STORE_ID} with your actual Salla store ID');
      store = '';
    }
    
    console.log('🔍 Store ID detected:', store || 'NONE');

    // محاولة auto-resolve
    if (!store) {
      try { store = await resolveStore(); }
      catch (err) { console.error('Error during store auto-resolution:', err); }
    }

    // لو لسه مفيش — اعرض رسالة تشخيصية
    const host = existingHost || ensureHostUnderProduct();
    if (!store) {
      if (host && host.getAttribute("data-mounted") !== "1") {
        const msg = document.createElement("div");
        msg.className = "theqah-widget-empty";
        msg.style.cssText = "padding:12px;border:1px dashed #94a3b8;border-radius:12px;opacity:.8;font:13px system-ui;";
        msg.textContent = (String(lang).toLowerCase() === 'ar')
          ? "لم يتم العثور على معرف المتجر. تأكد من تثبيت التطبيق في متجر سلة."
          : "Store ID not found. Make sure the app is installed in your Salla store.";
        host.appendChild(msg);
        host.setAttribute("data-mounted", "1");
      }
      return;
    }

    // product id
    const pidFromHost = host?.getAttribute("data-product") || host?.dataset?.product || null;
    const pid = (pidFromHost && pidFromHost !== "auto") ? pidFromHost : detectProductId();

    console.log('🚀 Mounting widget with config:', {
      store, pid, lang: String(lang).toLowerCase(), theme: String(theme).toLowerCase()
    });
    
    await mountOne(host, store, pid, limit, String(lang).toLowerCase(), String(theme).toLowerCase());
    mountedOnce = true;
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => safeMount());
  else safeMount();

  // دعم SPA (مرة واحدة)
  if (!window.__THEQAH_OBS__) {
    window.__THEQAH_OBS__ = true;
    const deb = debounce(() => safeMount(), 700);
    const obs = new MutationObserver(() => deb());
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }
})();


//public/widgets/theqah-widget.js
(() => {
  const SCRIPT_VERSION = "3.0.0"; // Smart badge: message OR logos on Salla reviews
  
  // حماية من التشغيل المتعدد
  if (window.__THEQAH_LOADING__) return;
  window.__THEQAH_LOADING__ = true;

  // ——— تحديد السكربت والمصدر ———
  const CURRENT_SCRIPT = document.currentScript;
  const SCRIPT_ORIGIN = (() => {
    try { return new URL(CURRENT_SCRIPT?.src || location.href).origin; }
    catch { return location.origin; }
  })();

  const API_BASE = `${SCRIPT_ORIGIN}/api/public/reviews`;
  const CHECK_API = `${SCRIPT_ORIGIN}/api/reviews/check-verified`;
  const LOGO_URL = `${SCRIPT_ORIGIN}/widgets/logo.png?v=3`;

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const url = `${API_BASE}/resolve?host=${encodeURIComponent(host)}&href=${encodeURIComponent(location.href)}&v=${encodeURIComponent(SCRIPT_VERSION)}`;
    G.resolvePromise = fetch(url, { 
        cache: 'no-store',
        signal: controller.signal
      })
      .then(r => {
        clearTimeout(timeoutId);
        return r.ok ? r.json() : null;
      })
      .then(j => {
        const uid = j?.storeUid || null;
        if (uid) { G.storeUid = uid; setCached(host, uid); }
        return uid;
      })
      .catch(e => {
        clearTimeout(timeoutId);
        console.warn('Store resolve failed:', e.message);
        return null;
      })
      .finally(() => { G.resolvePromise = null; });

    return G.resolvePromise;
  }

  // ——— إدراج الحاوية ———
  function findProductAnchor() {
    const fromData = document.querySelector("[data-product-id], [data-productid]");
    if (fromData) {
      const sec = fromData.closest("section, .product, .product-page, .product__details, .product-single, .product-show");
      if (sec) return sec;
    }
    
    const candidates = [
      ".product-description",
      ".product__description",
      "#product-description",
      ".product__details",
      ".product-show",
      ".product-single",
      ".product-details",
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
    
    return null;
  }

  function ensureHostUnderProduct() {
    let host = document.querySelector("#theqah-reviews, .theqah-reviews");
    if (host) return host;

    const anchor = findProductAnchor();
    if (!anchor) return null;
    
    host = document.createElement("div");
    host.className = "theqah-reviews";
    host.style.marginTop = "24px";
    
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(host, anchor.nextSibling);
    }
    
    return host;
  }

  // ——— Debounce ———
  function debounce(func, wait) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // ——— Extract product ID from page ———
  function extractProductId() {
    const fromData = document.querySelector("[data-product-id], [data-productid]");
    if (fromData) {
      const id = fromData.getAttribute("data-product-id") || fromData.getAttribute("data-productid");
      if (id) return id;
    }
    const match = location.pathname.match(/\/product\/(\d+)/);
    if (match) return match[1];
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('product_id') || urlParams.get('productId') || null;
  }

  // ——— Check verified reviews ———
  async function checkVerifiedReviews(storeId, productId) {
    try {
      const params = new URLSearchParams({ storeId });
      if (productId) params.append('productId', productId);
      const response = await fetch(`${CHECK_API}?${params}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return { hasVerified: false, reviews: [] };
      return await response.json();
    } catch (e) {
      console.warn('Check verified failed:', e.message);
      return { hasVerified: false, reviews: [] };
    }
  }

  // ——— Add logos to Salla reviews ———
  function addLogosToSallaReviews(verifiedIds) {
    if (!verifiedIds || verifiedIds.length === 0) return;
    const selectors = ['[data-review-id]', '.product-review', '.review-item', '.s-review-item'];
    selectors.forEach(selector => {
      const reviewElements = document.querySelectorAll(selector);
      reviewElements.forEach(el => {
        const reviewId = el.getAttribute('data-review-id') || el.getAttribute('data-id') || el.querySelector('[data-review-id]')?.getAttribute('data-review-id');
        if (!reviewId || !verifiedIds.includes(reviewId)) return;
        if (el.querySelector('.theqah-verified-logo')) return;
        let insertPoint = el.querySelector('.review-header') || el.querySelector('.review-stars') || el.querySelector('.review-rating') || el.firstElementChild;
        if (!insertPoint) return;
        const logo = document.createElement('img');
        logo.src = LOGO_URL;
        logo.className = 'theqah-verified-logo';
        logo.alt = 'Verified by Theqah';
        logo.style.cssText = 'width:24px;height:24px;margin:0 8px;display:inline-block;vertical-align:middle;border-radius:4px;';
        insertPoint.style.display = 'flex';
        insertPoint.style.alignItems = 'center';
        insertPoint.style.gap = '8px';
        insertPoint.appendChild(logo);
      });
    });
  }

  // ——— تركيب البادج الذكي ———
  async function mountOne(hostEl, store, lang, theme) {
    if (hostEl.getAttribute("data-state") === "done") return;
    if (hostEl.getAttribute("data-state") === "mounting") return;
    hostEl.setAttribute("data-state", "mounting");

    // ✨ Check for verified reviews
    const productId = extractProductId();
    const checkResult = await checkVerifiedReviews(store, productId);
    
    if (checkResult.hasVerified) {
      // Has verified reviews - add logos to Salla reviews
      const verifiedIds = checkResult.reviews.map(r => r.sallaReviewId);
      addLogosToSallaReviews(verifiedIds);
      hostEl.setAttribute("data-state", "done");
      return;
    }

    // No verified reviews - show message
    const root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;
    
    const style = h("style", {
      html: `
        :host { all: initial; }
        * { box-sizing: border-box; }
        
        .wrap { 
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Noto Sans,Liberation Sans,Arial,sans-serif; 
          direction: ${lang === "ar" ? "rtl" : "ltr"}; 
          line-height: 1.5;
          color: ${theme === "dark" ? "#f1f5f9" : "#1e293b"};
        }
        
        .section { 
          background: ${theme === "dark" 
            ? "linear-gradient(135deg, #0f1629 0%, #1e293b 100%)" 
            : "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)"};
          color: ${theme === "dark" ? "#f1f5f9" : "#1e293b"};
          border: 1px solid ${theme === "dark" ? "rgba(71, 85, 105, 0.3)" : "rgba(226, 232, 240, 0.8)"};
          border-radius: 16px; 
          padding: 20px 24px; 
          margin: 20px 0; 
          box-shadow: ${theme === "dark" 
            ? "0 10px 25px -5px rgba(0, 0, 0, 0.4)" 
            : "0 10px 25px -5px rgba(0, 0, 0, 0.1)"};
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
        
        .verified-badge {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0;
        }
        
        .badge-logo { 
          width: 48px; 
          height: 48px; 
          border-radius: 8px;
          flex-shrink: 0;
          transition: all 0.25s ease;
        }
        
        .badge-logo:hover { 
          transform: scale(1.05); 
        }
        
        .badge-text {
          font-size: 16px;
          font-weight: 600;
          color: ${theme === "dark" ? "#cbd5e1" : "#475569"};
          margin: 0;
          line-height: 1.5;
          letter-spacing: -0.01em;
        }
        
        @media (max-width: 640px) {
          .section { padding: 16px 20px; }
          .badge-text { font-size: 14px; }
          .badge-logo { width: 40px; height: 40px; }
        }
      `,
    });

    const verifiedText = lang === "ar" 
      ? "تقييمات هذا المتجر تخضع للتدقيق بواسطة مشتري موثق" 
      : "This store's reviews are verified by Theqah Trusted Buyer";

    const container = h("div", { class: "wrap" });
    
    const section = h("div", { class: "section" }, [
      h("div", { class: "verified-badge" }, [
        h("img", { class: "badge-logo", src: LOGO_URL, alt: "Theqah" }),
        h("p", { class: "badge-text" }, verifiedText),
      ]),
    ]);

    container.appendChild(section);
    root.appendChild(style);
    root.appendChild(container);

    hostEl.setAttribute("data-state", "done");
  }

  // ——— الدالة الرئيسية ———
  const safeMount = async () => {
    const existingHost = document.querySelector("#theqah-reviews, .theqah-reviews");

    let store =
      existingHost?.getAttribute?.("data-store") ||
      existingHost?.dataset?.store ||
      CURRENT_SCRIPT?.dataset?.store ||
      "";

    const lang =
      existingHost?.getAttribute?.("data-lang") ||
      existingHost?.dataset?.lang ||
      CURRENT_SCRIPT?.dataset?.lang ||
      (document.documentElement.lang === "ar" ? "ar" : "en");

    const theme =
      existingHost?.getAttribute?.("data-theme") ||
      existingHost?.dataset?.theme ||
      CURRENT_SCRIPT?.dataset?.theme ||
      "light";

    // تنظيف placeholder
    if (store && (store.includes('{') || /STORE_ID/i.test(store))) {
      console.warn('Clearing placeholder store:', store);
      store = '';
    }

    // محاولة auto-resolve
    if (!store) {
      try { 
        const resolveTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Resolve timeout')), 5000)
        );
        store = await Promise.race([resolveStore(), resolveTimeout]);
      }
      catch (err) { 
        console.warn('Store auto-resolution failed:', err.message);
        store = null;
      }
    }

    const host = existingHost || ensureHostUnderProduct();
    
    if (!host) {
      console.log('[Theqah] Not a product page - widget skipped');
      return;
    }
    
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

    await mountOne(host, store, String(lang).toLowerCase(), String(theme).toLowerCase());
    mountedOnce = true;
  };

  // تشغيل آمن
  const safeLaunch = () => {
    try {
      safeMount().catch(e => console.warn('Widget mount failed:', e.message));
    } catch (e) {
      console.warn('Widget initialization failed:', e.message);
    } finally {
      window.__THEQAH_LOADING__ = false;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeLaunch);
  } else {
    setTimeout(safeLaunch, 100);
  }

  // دعم SPA
  if (!window.__THEQAH_OBS__ && typeof MutationObserver !== 'undefined') {
    window.__THEQAH_OBS__ = true;
    const deb = debounce(() => safeMount(), 1000);
    const obs = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(m => 
        Array.from(m.addedNodes).some(n => 
          n.nodeType === 1 && (
            n.classList?.contains('theqah-reviews') || 
            n.querySelector?.('.theqah-reviews')
          )
        )
      );
      if (hasRelevantChanges) deb();
    });
    
    try {
      obs.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false,
        characterData: false
      });
      
      setTimeout(() => {
        obs.disconnect();
        window.__THEQAH_OBS__ = false;
      }, 30000);
    } catch (e) {
      console.warn('MutationObserver failed:', e);
    }
  }
})();

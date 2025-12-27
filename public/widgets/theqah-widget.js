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
  const CERTIFICATE_LOGO_URL = `${SCRIPT_ORIGIN}/widgets/logo.png?v=3`;

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
    if (G.storeData) return G.storeData;
    const cached = getCached(host);
    if (cached) { 
      // For backwards compatibility, handle both old format (string) and new format (object)
      if (typeof cached === 'string') {
        G.storeData = { storeUid: cached, certificatePosition: 'auto' };
      } else {
        G.storeData = cached;
      }
      return G.storeData;
    }

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
        if (!j?.storeUid) return null;
        const storeData = {
          storeUid: j.storeUid,
          certificatePosition: j.certificatePosition || 'auto'
        };
        G.storeData = storeData;
        setCached(host, storeData);
        return storeData;
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
    
    // Convert verified IDs to strings for comparison
    const verifiedIdStrings = verifiedIds.map(id => String(id));
    console.log('[Theqah] Looking for reviews with IDs:', verifiedIdStrings);
    
    // Salla modern theme uses salla-comment-item custom elements
    // with internal divs having id="s-comments-item-[REVIEW_ID]"
    const selectors = [
      'salla-comment-item',           // Salla modern custom element
      '.s-comments-item',              // Salla class selector
      '[id^="s-comments-item-"]',      // Direct ID pattern match
      '[data-review-id]',              // Legacy data attribute
      '[data-comment-id]',             // Alternative data attribute
      '.product-review',               // Generic
      '.review-item',                  // Generic
      '.s-review-item',                // Salla legacy
      '.comment-item',                 // Comment item
      '[class*="comment"]',            // Any class containing comment
      '[class*="review"]'              // Any class containing review
    ];
    
    let foundCount = 0;
    let addedCount = 0;
    
    selectors.forEach(selector => {
      const reviewElements = document.querySelectorAll(selector);
      if (reviewElements.length > 0) {
        console.log(`[Theqah] Found ${reviewElements.length} elements with selector: ${selector}`);
      }
      
      reviewElements.forEach(el => {
        // Extract review ID from multiple possible sources
        let reviewId = null;
        
        // 1. From data-review-id or data-comment-id attribute
        reviewId = el.getAttribute('data-review-id') || el.getAttribute('data-id') || el.getAttribute('data-comment-id');
        
        // 2. From internal div with id="s-comments-item-[ID]"
        if (!reviewId) {
          const wrapperDiv = el.querySelector('[id^="s-comments-item-"]');
          if (wrapperDiv) {
            const idMatch = wrapperDiv.id.match(/s-comments-item-(\d+)/);
            if (idMatch) reviewId = idMatch[1];
          }
        }
        
        // 3. From element's own id if it matches the pattern
        if (!reviewId && el.id) {
          const idMatch = el.id.match(/s-comments-item-(\d+)/) || el.id.match(/comment-(\d+)/) || el.id.match(/review-(\d+)/);
          if (idMatch) reviewId = idMatch[1];
        }
        
        // 4. From nested element with data-review-id
        if (!reviewId) {
          reviewId = el.querySelector('[data-review-id]')?.getAttribute('data-review-id') ||
                     el.querySelector('[data-comment-id]')?.getAttribute('data-comment-id');
        }
        
        // 5. Try to find ID in any attribute
        if (!reviewId) {
          const attrs = el.attributes;
          for (let i = 0; i < attrs.length; i++) {
            const match = attrs[i].value.match(/(\d{5,})/); // Look for numeric IDs with 5+ digits
            if (match) {
              reviewId = match[1];
              break;
            }
          }
        }
        
        if (reviewId) {
          foundCount++;
          console.log(`[Theqah] Found review element with ID: ${reviewId}, matches: ${verifiedIdStrings.includes(String(reviewId))}`);
        }
        
        if (!reviewId || !verifiedIdStrings.includes(String(reviewId))) return;
        if (el.querySelector('.theqah-verified-logo')) return;
        
        // Find best insertion point for Salla modern theme
        let insertPoint = 
          el.querySelector('.s-comments-item-user-info-name') ||  // User name in Salla
          el.querySelector('.s-comments-item-user-wrapper') ||    // User wrapper
          el.querySelector('[class*="user-name"]') ||             // Any user name class
          el.querySelector('[class*="user-info"]') ||             // Any user info class
          el.querySelector('[class*="author"]') ||                // Author class
          el.querySelector('.review-header') || 
          el.querySelector('.review-stars') || 
          el.querySelector('.review-rating') || 
          el.querySelector('[class*="rating"]') ||                // Any rating class
          el.firstElementChild;
        
        if (!insertPoint) {
          console.log('[Theqah] No insert point found for review:', reviewId);
          return;
        }
        
        console.log('[Theqah] Adding logo to review:', reviewId, 'at:', insertPoint.className || insertPoint.tagName);
        
        // Create clickable logo with link to theqah homepage
        const logoLink = document.createElement('a');
        logoLink.href = 'https://theqah.com.sa?ref=widget';
        logoLink.target = '_blank';
        logoLink.rel = 'noopener noreferrer';
        logoLink.title = 'مشتري موثق - Verified Buyer | theqah.com.sa';
        logoLink.style.cssText = 'display:inline-flex;align-items:center;text-decoration:none;transition:transform 0.2s ease;margin-inline-start:8px;';
        logoLink.onmouseover = function() { this.style.transform = 'scale(1.1)'; };
        logoLink.onmouseout = function() { this.style.transform = 'scale(1)'; };
        
        const logo = document.createElement('img');
        logo.src = LOGO_URL;
        logo.className = 'theqah-verified-logo';
        logo.alt = 'مشتري موثق - Verified Buyer';
        logo.style.cssText = 'width:60px;height:60px;margin:0 8px;display:inline-block;vertical-align:middle;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.15);cursor:pointer;';
        
        logoLink.appendChild(logo);
        insertPoint.style.display = 'flex';
        insertPoint.style.alignItems = 'center';
        insertPoint.style.gap = '8px';
        insertPoint.appendChild(logoLink);
        
        console.log('[Theqah] Added verified badge to review:', reviewId);
      });
    });
  }

  // ——— إنشاء بادج شهادة توثيق التقييمات ———
  function createCertificateBadge(lang = 'ar', theme = 'light') {
    // Check if certificate already exists
    if (document.querySelector('.theqah-certificate-badge')) return null;
    
    const isArabic = lang === 'ar';
    const isDark = theme === 'dark';
    
    const title = isArabic 
      ? 'شهادة توثيق التقييمات'
      : 'Verified Reviews Certificate';
    
    const subtitle = isArabic 
      ? 'جميع تقييمات هذا المتجر مدققة من مشتري موثق "طرف ثالث" لضمان المصداقية'
      : 'All store reviews are audited by Mushtari Mowthaq (Third Party) to ensure credibility';
    
    // Create the certificate container
    const container = h('div', { 
      class: 'theqah-certificate-badge',
      style: `
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Arial, sans-serif;
        direction: ${isArabic ? 'rtl' : 'ltr'};
        text-align: center;
        background: ${isDark 
          ? 'linear-gradient(135deg, #0f1629 0%, #1e293b 100%)' 
          : 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)'};
        border: 2px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.4)'};
        border-radius: 16px;
        padding: 24px;
        margin: 20px auto;
        max-width: 500px;
        box-shadow: ${isDark 
          ? '0 10px 25px -5px rgba(0, 0, 0, 0.4)' 
          : '0 10px 25px -5px rgba(34, 197, 94, 0.15)'};
        position: relative;
        overflow: hidden;
      `
    });
    
    // Add decorative top border
    container.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #22c55e, #16a34a, #22c55e);
      "></div>
    `;
    
    // Create logo with link
    const logoLink = h('a', {
      href: 'https://theqah.com.sa?ref=certificate',
      target: '_blank',
      rel: 'noopener noreferrer',
      style: `
        display: inline-block;
        margin-bottom: 16px;
        transition: transform 0.2s ease;
      `
    });
    
    const logo = h('img', {
      src: CERTIFICATE_LOGO_URL,
      alt: isArabic ? 'مشتري موثق' : 'Mushtari Mowthaq',
      style: `
        width: 72px;
        height: 72px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `
    });
    
    logoLink.appendChild(logo);
    logoLink.onmouseover = function() { this.style.transform = 'scale(1.05)'; };
    logoLink.onmouseout = function() { this.style.transform = 'scale(1)'; };
    
    // Create title
    const titleEl = h('h3', {
      style: `
        font-size: 20px;
        font-weight: 700;
        color: ${isDark ? '#22c55e' : '#15803d'};
        margin: 0 0 12px 0;
        line-height: 1.4;
      `
    }, title);
    
    // Create subtitle
    const subtitleEl = h('p', {
      style: `
        font-size: 14px;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        margin: 0;
        line-height: 1.6;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
      `
    }, subtitle);
    
    container.appendChild(logoLink);
    container.appendChild(titleEl);
    container.appendChild(subtitleEl);
    
    return container;
  }

  // ——— إدراج شهادة التوثيق في صفحة المتجر ———
  function insertCertificateBadge(storeUid, lang, theme, position = 'auto') {
    // Check if already inserted
    if (document.querySelector('.theqah-certificate-badge')) return;
    
    const certificate = createCertificateBadge(lang, theme);
    if (!certificate) return;
    
    // Smart Heuristics: find best placement based on position setting
    const placement = findBestPlacement(position);
    
    if (!placement) {
      console.log('[Theqah] No suitable placement found for certificate');
      return;
    }
    
    if (placement.type === 'floating') {
      // Floating badge in corner
      certificate.style.cssText += `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        max-width: 320px;
        animation: theqah-slide-in 0.3s ease-out;
      `;
      document.body.appendChild(certificate);
      console.log('[Theqah] Certificate badge inserted as floating');
    } else if (placement.element) {
      if (placement.position === 'before') {
        placement.element.parentNode.insertBefore(certificate, placement.element);
      } else {
        placement.element.parentNode.insertBefore(certificate, placement.element.nextSibling);
      }
      console.log('[Theqah] Certificate badge inserted:', placement.position, 'reviews');
    }
  }

  // ——— Smart Heuristics: تحديد أفضل مكان للشهادة ———
  function findBestPlacement(position) {
    // إذا حدد صاحب المتجر مكان معين
    if (position === 'before-reviews') {
      const reviews = document.querySelector(
        'salla-products-comments, .s-comments-list, .product-reviews, #reviews, [data-reviews]'
      );
      if (reviews) return { element: reviews, position: 'before' };
    }
    
    if (position === 'after-reviews') {
      const reviews = document.querySelector(
        'salla-products-comments, .s-comments-list, .product-reviews, #reviews, [data-reviews]'
      );
      if (reviews) return { element: reviews, position: 'after' };
    }
    
    if (position === 'footer') {
      const footer = document.querySelector('footer, .s-footer, .store-footer');
      if (footer) return { element: footer, position: 'before' };
    }
    
    if (position === 'floating') {
      return { type: 'floating' };
    }
    
    // Auto mode: Smart Heuristics based on page structure
    // أولوية 1: قبل قسم التقييمات مباشرة
    const reviewsSection = document.querySelector(
      'salla-products-comments, .s-comments-list, .product-reviews, .reviews-section, #reviews, [data-reviews]'
    );
    if (reviewsSection) {
      return { element: reviewsSection, position: 'before' };
    }
    
    // أولوية 2: بعد وصف المنتج
    const productDesc = document.querySelector(
      '.product-description, .product__description, .s-product-description, [data-product-description]'
    );
    if (productDesc) {
      return { element: productDesc, position: 'after' };
    }
    
    // أولوية 3: بعد معلومات المنتج
    const productInfo = document.querySelector(
      '.product-info, .product__info, .s-product-info, .product-details'
    );
    if (productInfo) {
      return { element: productInfo, position: 'after' };
    }
    
    // أولوية 4: في الفوتر
    const footer = document.querySelector('footer, .s-footer');
    if (footer) {
      return { element: footer, position: 'before' };
    }
    
    // Fallback: Floating badge
    return { type: 'floating' };
  }


  // ——— تركيب البادج الذكي ———
  async function mountOne(hostEl, store, lang, theme, certificatePosition = 'auto') {
    if (hostEl.getAttribute("data-state") === "done") return;
    if (hostEl.getAttribute("data-state") === "mounting") return;
    hostEl.setAttribute("data-state", "mounting");

    // ✨ Check for verified reviews
    const productId = extractProductId();
    const checkResult = await checkVerifiedReviews(store, productId);
    
    // Always insert the certificate badge for subscribed stores
    insertCertificateBadge(store, lang, theme, certificatePosition);
    console.log('[Theqah] Certificate badge inserted for store:', store);
    
    if (checkResult.hasVerified) {
      // Has verified reviews - add logos to Salla reviews
      const verifiedIds = checkResult.reviews.map(r => r.sallaReviewId);
      addLogosToSallaReviews(verifiedIds);
      console.log('[Theqah] Added logos to verified reviews:', verifiedIds.length);
    }

    hostEl.setAttribute("data-state", "done");
    return;
    
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

    // تنظيف placeholder - تجاهل أي store ID يحتوي على placeholder
    if (store && (store.includes('{') || /STORE_ID/i.test(store) || store === 'salla:' || !store.includes(':'))) {
      console.log('[Theqah] Detected placeholder store:', store, '- attempting auto-resolve');
      store = '';
    }

    // محاولة auto-resolve - دائماً نحاول resolve من domain
    let storeData = null;
    let certificatePosition = 'auto';
    
    if (!store) {
      try { 
        const resolveTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Resolve timeout')), 5000)
        );
        storeData = await Promise.race([resolveStore(), resolveTimeout]);
        if (storeData) {
          store = storeData.storeUid;
          certificatePosition = storeData.certificatePosition || 'auto';
          console.log('[Theqah] Store resolved:', store, 'position:', certificatePosition);
        }
      }
      catch (err) { 
        console.warn('[Theqah] Store resolution failed:', err.message);
        store = null;
      }
    }

    const host = existingHost || ensureHostUnderProduct();
    
    if (!host) {
      // Not a product page - widget skipped
      return;
    }
    
    if (!store) {
      // Silent fail - store not resolved
      return;
    }

    await mountOne(host, store, String(lang).toLowerCase(), String(theme).toLowerCase(), certificatePosition);
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

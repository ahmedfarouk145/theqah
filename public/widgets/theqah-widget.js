//public/widgets/theqah-widget.js
(() => {
  const SCRIPT_VERSION = "3.0.0"; // Smart badge: message OR logos on Salla reviews

  // حماية من التشغيل المتعدد
  if (window.__THEQAH_LOADING__) return;
  window.__THEQAH_LOADING__ = true;

  // ——— تحديد السكربت والمصدر ———
  const CURRENT_SCRIPT = document.currentScript;
  const SCRIPT_ORIGIN = (() => {
    try {
      const origin = new URL(CURRENT_SCRIPT?.src || location.href).origin;
      // Always use www subdomain to avoid CORS redirect issues
      return origin.replace('://theqah.com.sa', '://www.theqah.com.sa');
    }
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

  function cacheKey(host) { return `theqah:storeUid:${host}`; }
  function getCached(host) {
    try {
      const o = JSON.parse(localStorage.getItem(cacheKey(host)) || '{}');
      if (o.uid && (Date.now() - (o.t || 0) < TTL_MS)) return o.uid;
    } catch { }
    return null;
  }
  function setCached(host, uid) {
    try { localStorage.setItem(cacheKey(host), JSON.stringify({ uid, t: Date.now() })); } catch { }
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
      .catch(() => {
        clearTimeout(timeoutId);
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
    return function (...args) {
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

  function buildStoreReviewsUrl(storeUid, reviewId) {
    const base = `${SCRIPT_ORIGIN}/store/${encodeURIComponent(storeUid)}/reviews`;
    const params = new URLSearchParams();
    if (reviewId) params.set('review', reviewId);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
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
    } catch {
      return { hasVerified: false, reviews: [] };
    }
  }

  // ——— Fetch and add logos helper ———
  async function fetchAndAddLogos(storeUid) {
    try {
      const productId = extractProductId();
      console.log('[theqah-widget] fetchAndAddLogos store=' + storeUid + ' productId=' + (productId || 'none'));
      const checkResult = await checkVerifiedReviews(storeUid, productId);
      console.log('[theqah-widget] API response: hasVerified=' + checkResult.hasVerified + ' count=' + (checkResult.reviews?.length || 0));

      if (checkResult.hasVerified) {
        const verifiedReviews = (Array.isArray(checkResult.reviews) ? checkResult.reviews : [])
          .filter(r => r && r.sallaReviewId)
          .map(r => ({
            reviewId: r.reviewId ? String(r.reviewId) : null,
            sallaReviewId: String(r.sallaReviewId)
          }));

        console.log('[theqah-widget] verified sallaIds=[' + verifiedReviews.map(r => r.sallaReviewId).join(',') + ']');

        G.verifiedReviews = verifiedReviews;
        G.verifiedIds = verifiedReviews.map(r => r.sallaReviewId);
        addLogosToSallaReviews(verifiedReviews, storeUid);

        const placedCount = document.querySelectorAll('.theqah-verified-logo').length;
        console.log('[theqah-widget] after first pass: placed=' + placedCount + ' expected=' + verifiedReviews.length);

        // iOS Safari: Shadow DOM / custom elements render late.
        // Retry logo injection with increasing delays to catch late-rendered reviews.
        const expectedCount = verifiedReviews.length;
        const retryDelays = [500, 1500, 3000, 5000];
        retryDelays.forEach(delay => {
          setTimeout(() => {
            const currentCount = document.querySelectorAll('.theqah-verified-logo').length;
            if (currentCount < expectedCount) {
              console.log('[theqah-widget] retry @' + delay + 'ms: placed=' + currentCount + '/' + expectedCount);
              addLogosToSallaReviews(verifiedReviews, storeUid);
            }
          }, delay);
        });
      } else {
        console.log('[theqah-widget] no verified reviews for store=' + storeUid);
      }
    } catch (e) { console.warn('[theqah-widget] fetchAndAddLogos error:', e); }
  }

  // ——— Add logos to Salla reviews ———
  function addLogosToSallaReviews(verifiedReviews, storeUidOverride) {
    if (!Array.isArray(verifiedReviews) || verifiedReviews.length === 0) return;

    const reviewLinkMap = new Map();
    verifiedReviews.forEach((item) => {
      if (item?.sallaReviewId) {
        reviewLinkMap.set(String(item.sallaReviewId), item.reviewId ? String(item.reviewId) : null);
      }
    });

    // Convert verified IDs to strings for comparison
    const verifiedIdStrings = Array.from(reviewLinkMap.keys());


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

      reviewElements.forEach(el => {
        // Extract review ID from multiple possible sources
        let domReviewId = null;

        // 1. From data-review-id or data-comment-id attribute on the element itself
        domReviewId = el.getAttribute('data-review-id') || el.getAttribute('data-id') || el.getAttribute('data-comment-id');

        // 1b. Salla custom element attributes (Vue-style bindings rendered as attributes)
        if (!domReviewId) {
          domReviewId = el.getAttribute('comment-id') || el.getAttribute('commentid') ||
            el.getAttribute(':comment-id') || el.getAttribute(':id') ||
            el.getAttribute('review-id') || el.getAttribute('reviewid');
        }

        // 1c. For salla-comment-item, try to extract from any attribute containing a numeric ID
        if (!domReviewId && el.tagName?.toLowerCase() === 'salla-comment-item') {
          const attrs = el.attributes;
          for (let i = 0; i < attrs.length; i++) {
            const name = attrs[i].name.toLowerCase();
            if (name === 'class' || name === 'style' || name === 'slot') continue;
            const match = attrs[i].value.match(/^(\d{5,})$/); // Exact numeric ID
            if (match) {
              domReviewId = match[1];
              break;
            }
          }
        }

        // 2. From internal div with id="s-comments-item-[ID]"
        if (!domReviewId) {
          const wrapperDiv = el.querySelector('[id^="s-comments-item-"]');
          if (wrapperDiv) {
            const idMatch = wrapperDiv.id.match(/s-comments-item-(\d+)/);
            if (idMatch) domReviewId = idMatch[1];
          }
        }

        // 3. From element's own id if it matches the pattern
        if (!domReviewId && el.id) {
          const idMatch = el.id.match(/s-comments-item-(\d+)/) || el.id.match(/comment-(\d+)/) || el.id.match(/review-(\d+)/);
          if (idMatch) domReviewId = idMatch[1];
        }

        // 4. From nested element with data-review-id
        if (!domReviewId) {
          domReviewId = el.querySelector('[data-review-id]')?.getAttribute('data-review-id') ||
            el.querySelector('[data-comment-id]')?.getAttribute('data-comment-id');
        }

        // 5. Try to find ID in any attribute
        if (!domReviewId) {
          const attrs = el.attributes;
          for (let i = 0; i < attrs.length; i++) {
            const match = attrs[i].value.match(/(\d{5,})/); // Look for numeric IDs with 5+ digits
            if (match) {
              domReviewId = match[1];
              break;
            }
          }
        }

        // 6. Check shadow DOM for salla-comment-item (open shadow DOM only)
        if (!domReviewId && el.shadowRoot) {
          const shadowDiv = el.shadowRoot.querySelector('[id^="s-comments-item-"]');
          if (shadowDiv) {
            const idMatch = shadowDiv.id.match(/s-comments-item-(\d+)/);
            if (idMatch) domReviewId = idMatch[1];
          }
          // Also try other selectors inside shadow DOM
          if (!domReviewId) {
            const shadowReview = el.shadowRoot.querySelector('[data-review-id], [data-comment-id], [data-id]');
            if (shadowReview) {
              domReviewId = shadowReview.getAttribute('data-review-id') ||
                shadowReview.getAttribute('data-comment-id') ||
                shadowReview.getAttribute('data-id');
            }
          }
        }





        if (!domReviewId || !verifiedIdStrings.includes(String(domReviewId))) return;
        // Check for existing logo in both light DOM and shadow DOM
        if (el.querySelector('.theqah-verified-logo')) return;
        if (el.shadowRoot?.querySelector('.theqah-verified-logo')) return;

        // Find best insertion point for Salla modern theme
        // Try light DOM first, then shadow DOM, then element itself as fallback
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

        // Shadow DOM fallback for iOS Safari
        if (!insertPoint && el.shadowRoot) {
          insertPoint =
            el.shadowRoot.querySelector('.s-comments-item-user-info-name') ||
            el.shadowRoot.querySelector('.s-comments-item-user-wrapper') ||
            el.shadowRoot.querySelector('[class*="user-name"]') ||
            el.shadowRoot.querySelector('[class*="user-info"]') ||
            el.shadowRoot.querySelector('[class*="rating"]') ||
            el.shadowRoot.firstElementChild;
        }

        // Ultimate fallback: append directly to the element
        if (!insertPoint) insertPoint = el;



        const publicReviewId = reviewLinkMap.get(String(domReviewId));
        const resolvedStoreUid = storeUidOverride || G.storeData?.storeUid || G.storeUid || '';
        const logoLink = document.createElement('a');
        logoLink.href = resolvedStoreUid
          ? buildStoreReviewsUrl(resolvedStoreUid, publicReviewId)
          : SCRIPT_ORIGIN;
        logoLink.target = '_blank';
        logoLink.rel = 'noopener noreferrer';
        logoLink.title = publicReviewId
          ? 'مشتري موثق - عرض هذا التقييم الموثق'
          : 'مشتري موثق - عرض تقييمات المتجر';
        logoLink.style.cssText = 'display:inline-flex;align-items:center;text-decoration:none;transition:transform 0.2s ease;margin-inline-start:8px;';
        logoLink.onmouseover = function () { this.style.transform = 'scale(1.1)'; };
        logoLink.onmouseout = function () { this.style.transform = 'scale(1)'; };

        const logo = document.createElement('img');
        logo.src = LOGO_URL;
        logo.className = 'theqah-verified-logo';
        logo.alt = 'مشتري موثق - Verified Buyer';
        logo.style.cssText = 'width:60px;height:60px;margin:0 8px;display:inline-block;vertical-align:middle;cursor:pointer;background:transparent;';

        logoLink.appendChild(logo);
        insertPoint.style.display = 'flex';
        insertPoint.style.alignItems = 'center';
        insertPoint.style.gap = '8px';
        insertPoint.appendChild(logoLink);


      });
    });
  }

  // ——— إنشاء بادج شهادة توثيق التقييمات ———
  function createCertificateBadge(lang = 'ar', theme = 'light') {
    // Check if certificate already exists
    if (document.querySelector('.theqah-certificate-badge')) return null;

    // Inject Cairo Font if not present
    if (!document.getElementById('theqah-font-cairo')) {
      const link = document.createElement('link');
      link.id = 'theqah-font-cairo';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap';
      document.head.appendChild(link);
    }

    const isArabic = lang === 'ar';
    const isDark = theme === 'dark';

    const title = isArabic
      ? 'شهادة توثيق التقييمات'
      : 'Verified Reviews Certificate';

    // Updated subtitle as per user request (referencing "Verified Buyer Third Party")
    const subtitle = isArabic
      ? 'جميع تقييمات هذا المتجر مدققة من مشتري موثق "طرف ثالث" لضمان المصداقية'
      : 'All store reviews are audited by verified buyer "Third Party" to ensure credibility';

    // Create the certificate container (Option 6: Transparent, No Border)
    const container = h('div', {
      class: 'theqah-certificate-badge',
      style: `
        font-family: 'Cairo', system-ui, -apple-system, sans-serif;
        direction: ${isArabic ? 'rtl' : 'ltr'};
        text-align: center;
        background: transparent;
        border: none;
        border-radius: 16px;
        padding: 24px;
        margin: 20px auto;
        max-width: 500px;
        position: relative;
        overflow: visible;
      `
    });

    // Link the certificate badge to the store review page when possible.
    const _certStoreUid = G.storeData?.storeUid || G.storeUid || '';
    const logoLink = h('a', {
      href: _certStoreUid
        ? buildStoreReviewsUrl(_certStoreUid)
        : SCRIPT_ORIGIN,
      target: '_blank',
      rel: 'noopener noreferrer',
      style: `
        display: inline-block;
        margin-bottom: 20px;
        transition: transform 0.2s ease;
      `
    });

    const logo = h('img', {
      src: CERTIFICATE_LOGO_URL,
      alt: isArabic ? 'مشتري موثق' : 'Mushtari Mowthaq',
      style: `
        width: 150px;
        height: 150px;
        object-fit: contain;
        background: transparent;
        filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.5));
      `
    });

    logoLink.appendChild(logo);
    logoLink.onmouseover = function () { this.style.transform = 'scale(1.05)'; };
    logoLink.onmouseout = function () { this.style.transform = 'scale(1)'; };

    // Create title (Option 6: Gradient, Extra Bold)
    const titleEl = h('h3', {
      style: `
        font-size: 28px;
        font-weight: 900;
        margin: 0 0 12px 0;
        line-height: 1.3;
        background: linear-gradient(to left, #10b981, #3b82f6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        color: #10b981; /* Fallback */
        display: inline-block;
      `
    }, title);

    // Create subtitle
    const subtitleEl = h('p', {
      style: `
        font-size: 15px;
        font-weight: 600;
        color: ${isDark ? '#94a3b8' : '#4b5563'};
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
    const existing = document.querySelector('.theqah-certificate-badge');
    if (existing) {
      // Fix for tabbed interfaces: If existing badge is hidden (e.g. in a hidden tab), 
      // remove it so we can re-insert in the active location.
      if (existing.offsetParent === null) {
        existing.remove();
      } else {
        return; // Already exists and is visible
      }
    }

    const certificate = createCertificateBadge(lang, theme);
    if (!certificate) return;

    // Smart Heuristics: find best placement based on position setting
    const placement = findBestPlacement(position);

    if (!placement) return;

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

    } else if (placement.element) {
      if (placement.position === 'before') {
        placement.element.parentNode.insertBefore(certificate, placement.element);
      } else {
        placement.element.parentNode.insertBefore(certificate, placement.element.nextSibling);
      }

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

    if (reviewsSection && isVisible(reviewsSection)) {
      return { element: reviewsSection, position: 'before' };
    }

    // أولوية 2: بعد وصف المنتج
    const productDesc = document.querySelector(
      '.product-description, .product__description, .s-product-description, [data-product-description]'
    );

    if (productDesc && isVisible(productDesc)) {
      return { element: productDesc, position: 'after' };
    }

    // أولوية 3: بعد معلومات المنتج
    const productInfo = document.querySelector(
      '.product-info, .product__info, .s-product-info, .product-details'
    );

    if (productInfo && isVisible(productInfo)) {
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

  // Helper to check visibility
  function isVisible(el) {
    return !!(el && el.offsetParent !== null);
  }

  // ——— تركيب البادج الذكي ———
  async function mountOne(hostEl, store, lang, theme, certificatePosition = 'auto') {
    // Always insert/update the certificate badge for subscribed stores
    // This runs on every mount/update check to handle tab switching
    insertCertificateBadge(store, lang, theme, certificatePosition);

    // If already mounted, still try to add logos (reviews tab might have just become visible)
    if (hostEl.getAttribute("data-state") === "done") {
      // Re-try logo injection even if already mounted
      if (G.verifiedReviews && G.verifiedReviews.length > 0) {
        addLogosToSallaReviews(G.verifiedReviews, G.storeUid);
      } else if (G.storeUid) {
        // If no verifiedIds cached yet, fetch them now
        fetchAndAddLogos(G.storeUid);
      }
      return;
    }
    if (hostEl.getAttribute("data-state") === "mounting") return;
    hostEl.setAttribute("data-state", "mounting");

    // Cache storeUid for later re-checks
    G.storeUid = store;

    // ✨ Check for verified reviews
    await fetchAndAddLogos(store);

    hostEl.setAttribute("data-state", "done");


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

        }
      }
      catch {
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
      safeMount().catch(() => { });
    } catch {
      // Silent fail
    } finally {
      window.__THEQAH_LOADING__ = false;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeLaunch);
  } else {
    setTimeout(safeLaunch, 100);
  }

  // دعم SPA + detect Salla review list changes (sorting/pagination/tab switching)
  if (!window.__THEQAH_OBS__ && typeof MutationObserver !== 'undefined') {
    window.__THEQAH_OBS__ = true;

    const reAddLogos = debounce(() => {
      // Use globally cached verified IDs
      if (G.verifiedReviews && G.verifiedReviews.length > 0) {
        addLogosToSallaReviews(G.verifiedReviews, G.storeUid);
      } else if (G.storeUid) {
        // If no cached IDs, try fetching them (first time reviews became visible)
        fetchAndAddLogos(G.storeUid);
      }
    }, 300);

    const deb = debounce(() => safeMount(), 1000);

    const obs = new MutationObserver((mutations) => {
      let hasRelevantChanges = false;
      let hasSallaReviewChanges = false;

      for (const m of mutations) {
        // Check for theqah-reviews container
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            if (n.classList?.contains('theqah-reviews') || n.querySelector?.('.theqah-reviews')) {
              hasRelevantChanges = true;
            }
            // Detect Salla review elements being added (after sort/pagination)
            if (
              n.tagName?.toLowerCase() === 'salla-comment-item' ||
              n.classList?.contains('s-comments-item') ||
              n.id?.startsWith('s-comments-item-') ||
              n.querySelector?.('salla-comment-item') ||
              n.querySelector?.('[id^="s-comments-item-"]')
            ) {
              hasSallaReviewChanges = true;
            }
          }
        }

        // Also check if reviews container children changed (Salla may replace inner content)
        if (m.target?.tagName?.toLowerCase() === 'salla-products-comments' ||
          m.target?.classList?.contains('s-comments-list')) {
          hasSallaReviewChanges = true;
        }

        // Detect attribute changes that indicate tab switching (display, class, aria changes)
        if (m.type === 'attributes') {
          const target = m.target;
          if (target?.nodeType === 1) {
            const tagName = target.tagName?.toLowerCase();
            const classList = target.classList;
            // Check if a reviews-related element became visible
            if (
              tagName === 'salla-products-comments' ||
              classList?.contains('s-comments-list') ||
              classList?.contains('s-comments') ||
              target.querySelector?.('salla-comment-item') ||
              target.querySelector?.('[id^="s-comments-item-"]')
            ) {
              hasSallaReviewChanges = true;
            }
            // Detect tab panel visibility changes
            if (
              m.attributeName === 'class' ||
              m.attributeName === 'style' ||
              m.attributeName === 'hidden' ||
              m.attributeName === 'aria-hidden' ||
              m.attributeName === 'role'
            ) {
              // Check if this element or its children contain review elements
              if (target.querySelector?.('salla-comment-item, .s-comments-item, [id^="s-comments-item-"]')) {
                hasSallaReviewChanges = true;
              }
            }
          }
        }
      }

      if (hasRelevantChanges) deb();
      if (hasSallaReviewChanges) reAddLogos();
    });

    try {
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,  // Watch attribute changes for tab switches
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-selected'],
        characterData: false
      });

      // Keep observer active longer for dynamic pages
      setTimeout(() => {
        obs.disconnect();
        window.__THEQAH_OBS__ = false;
      }, 300000); // Extended to 5 minutes
    } catch {
      // Silent fail
    }

    // Also listen for Salla custom events
    try {
      document.addEventListener('salla::comments::loaded', () => reAddLogos());
      document.addEventListener('salla::comments::sorted', () => reAddLogos());
      document.addEventListener('salla::comments::paginated', () => reAddLogos());
    } catch {
      // Silent fail
    }

    // Listen for clicks on tab buttons (common in Salla themes)
    try {
      document.addEventListener('click', (e) => {
        const target = e.target?.closest?.('[role="tab"], .tab, .tabs__item, .nav-link, [data-tab], [data-toggle="tab"]');
        if (!target) return;
        const text = (target.textContent || '').trim();
        // Check if this is a reviews/ratings tab
        if (/تقييم|التقييمات|reviews?|ratings?|comments?/i.test(text) ||
          target.getAttribute('data-tab')?.includes('comment') ||
          target.getAttribute('data-tab')?.includes('review') ||
          target.getAttribute('href')?.includes('comment') ||
          target.getAttribute('href')?.includes('review')) {
          // Delay to let the tab content render
          setTimeout(() => reAddLogos(), 500);
          setTimeout(() => reAddLogos(), 1500);
        }
      }, true);
    } catch {
      // Silent fail
    }
  }
})();

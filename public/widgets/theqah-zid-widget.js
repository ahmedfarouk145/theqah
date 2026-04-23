// public/widgets/theqah-zid-widget.js
// Zid-specific widget — certificate badge + verified review logos
(() => {
  const SCRIPT_VERSION = '2.1.0';

  // Prevent double load
  if (window.__THEQAH_ZID_LOADING__) return;
  window.__THEQAH_ZID_LOADING__ = true;

  // ——— Script origin (always use www) ———
  const CURRENT_SCRIPT = document.currentScript;
  const SCRIPT_ORIGIN = (() => {
    try {
      const origin = new URL(CURRENT_SCRIPT?.src || location.href).origin;
      return origin.replace('://theqah.com.sa', '://www.theqah.com.sa');
    } catch { return 'https://www.theqah.com.sa'; }
  })();

  const API_RESOLVE = `${SCRIPT_ORIGIN}/api/public/reviews/resolve`;
  const API_CHECK = `${SCRIPT_ORIGIN}/api/reviews/check-verified`;
  const API_PROFILE = `${SCRIPT_ORIGIN}/api/public/store-profile`;
  const LOGO_URL = `${SCRIPT_ORIGIN}/widgets/logo.png?v=3`;

  // ——— Shared state ———
  const G = (window.__THEQAH_ZID__ = window.__THEQAH_ZID__ || {});
  const TTL_MS = 10 * 60 * 1000;
  let mainRunning = false;

  // ——— Helpers ———
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach(c => (typeof c === 'string' ? el.appendChild(document.createTextNode(c)) : el.appendChild(c)));
    return el;
  };

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ——— SHA-256 hash (browser crypto.subtle) ———
  async function domHash(authorName, createdAt) {
    const data = new TextEncoder().encode(authorName + '|' + createdAt);
    const buf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.substring(0, 16);
  }

  // ——— localStorage cache + single-flight resolve ———
  function cacheKey(host) { return `theqah:zid:${host}`; }
  function getCached(host) {
    try {
      const o = JSON.parse(localStorage.getItem(cacheKey(host)) || '{}');
      if (o.uid && (Date.now() - (o.t || 0) < TTL_MS)) return o;
    } catch { }
    return null;
  }
  function setCached(host, data) {
    try { localStorage.setItem(cacheKey(host), JSON.stringify({ ...data, t: Date.now() })); } catch { }
  }

  async function resolveStore() {
    const host = location.host.replace(/^www\./, '').toLowerCase();

    // Memory cache
    if (G.storeData) return G.storeData;

    // localStorage
    const cached = getCached(host);
    if (cached) {
      G.storeData = { storeUid: cached.uid, certificatePosition: cached.pos || 'auto' };
      return G.storeData;
    }

    // Single-flight
    if (G.resolvePromise) return G.resolvePromise;

    const url = `${API_RESOLVE}?host=${encodeURIComponent(host)}&href=${encodeURIComponent(location.href)}&v=${encodeURIComponent(SCRIPT_VERSION)}`;

    G.resolvePromise = fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j?.storeUid) return null;
        G.storeData = { storeUid: j.storeUid, certificatePosition: j.certificatePosition || 'auto' };
        setCached(host, { uid: j.storeUid, pos: j.certificatePosition || 'auto' });
        return G.storeData;
      })
      .catch(() => null)
      .finally(() => { G.resolvePromise = null; });

    return G.resolvePromise;
  }

  // ——— Extract productId from JSON-LD ———
  function extractProductId() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const data = JSON.parse(s.textContent);
        if (data['@type']?.toLowerCase() === 'product' && data.productID) {
          return data.productID;
        }
      }
    } catch { }
    return null;
  }

  // ——— JSON-LD schema injection for AI search engines ———
  function injectReviewSchemaJsonLd(verifiedReviews, storeUid) {
    const existing = document.getElementById('theqah-reviews-jsonld');
    if (existing) existing.remove();

    const validReviews = (Array.isArray(verifiedReviews) ? verifiedReviews : [])
      .filter(r => r && r.stars && r.authorName);
    if (validReviews.length === 0) return;

    // Extract product info from page JSON-LD if available
    let productName = null;
    let productUrl = null;
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const data = JSON.parse(s.textContent);
        if (data['@type']?.toLowerCase() === 'product') {
          productName = data.name || null;
          productUrl = data.url || null;
          break;
        }
      }
    } catch { /* ignore */ }

    const reviewSchema = validReviews.map(r => {
      const review = {
        '@type': 'Review',
        'author': { '@type': 'Person', 'name': r.authorName },
        'reviewRating': {
          '@type': 'Rating',
          'ratingValue': r.stars,
          'bestRating': 5,
          'worstRating': 1
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'مشتري موثق - Theqah',
          'url': SCRIPT_ORIGIN
        }
      };
      if (r.text) review.reviewBody = r.text;
      if (r.publishedAt) review.datePublished = new Date(r.publishedAt).toISOString().split('T')[0];
      if (r.productName || productName) {
        review.itemReviewed = {
          '@type': 'Product',
          'name': r.productName || productName
        };
        if (productUrl) review.itemReviewed.url = productUrl;
      }
      return review;
    });

    const totalStars = validReviews.reduce((sum, r) => sum + r.stars, 0);
    const avgRating = (totalStars / validReviews.length).toFixed(1);

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      'name': 'مشتري موثق - Theqah',
      'url': SCRIPT_ORIGIN,
      'review': reviewSchema
    };

    if (productName || validReviews[0]?.productName) {
      schema['@type'] = 'Product';
      schema.name = productName || validReviews[0].productName;
      if (productUrl) schema.url = productUrl;
      schema.aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': avgRating,
        'reviewCount': validReviews.length,
        'bestRating': 5,
        'worstRating': 1
      };
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'theqah-reviews-jsonld';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }

  // ——— Check verified reviews ———
  async function checkVerifiedReviews(storeUid, productId) {
    try {
      const params = new URLSearchParams({ storeId: storeUid });
      if (productId) params.append('productId', productId);
      const r = await fetch(`${API_CHECK}?${params}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return { hasVerified: false, reviews: [] };
      return await r.json();
    } catch {
      return { hasVerified: false, reviews: [] };
    }
  }

  // ——— Fetch store profile (name + verified count) ———
  async function fetchStoreProfile(storeUid) {
    try {
      const url = `${API_PROFILE}?storeUid=${encodeURIComponent(storeUid)}`;
      const res = await fetch(url, { cache: 'default', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        storeName: data?.store?.name || null,
        verifiedCount: Number.isFinite(data?.stats?.totalReviews) ? data.stats.totalReviews : 0,
      };
    } catch { return null; }
  }

  // Deterministic certificate code — djb2 → base36 → 6 chars.
  function certCode(uid) {
    if (!uid) return '';
    let hash = 5381;
    for (let i = 0; i < uid.length; i++) hash = ((hash * 33) ^ uid.charCodeAt(i)) >>> 0;
    return 'TQ-' + (hash.toString(36).toUpperCase() + '000000').slice(0, 6);
  }

  // ——— Certificate badge ———
  function insertCertificateBadge(storeUid, profile = null) {
    const existing = document.querySelector('.theqah-zid-certificate');
    if (existing) {
      if (existing.offsetParent === null) existing.remove();
      else return;
    }

    // Inject Cairo font
    if (!document.getElementById('theqah-font-cairo')) {
      const link = document.createElement('link');
      link.id = 'theqah-font-cairo';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap';
      document.head.appendChild(link);
    }

    const certUrl = `${SCRIPT_ORIGIN}/store/${encodeURIComponent(storeUid)}/certificate`;

    const verifiedCount = Number.isFinite(profile?.verifiedCount) ? profile.verifiedCount : null;
    const storeName = (profile?.storeName || '').trim();
    const hasNoReviews = verifiedCount === 0;
    const hasReviews = Number.isFinite(verifiedCount) && verifiedCount > 0;
    const code = certCode(storeUid);

    const titleText = storeName || 'شهادة توثيق التقييمات';
    const subtitleText = hasNoReviews
      ? `${storeName ? `متجر ${storeName}` : 'هذا المتجر'} انضم حديثاً لمنصة مشتري موثق وإلى الآن لا يوجد تقييمات موثقة`
      : 'جميع تقييمات هذا المتجر مدققة من مشتري موثق "طرف ثالث" لضمان المصداقية';

    // Root container — transparent, vertical stack, centered.
    const container = h('div', {
      class: 'theqah-zid-certificate',
      style: "font-family:'Cairo',system-ui,-apple-system,sans-serif;direction:rtl;text-align:center;background:transparent;border:none;padding:28px 20px 24px;margin:20px auto;max-width:500px;display:flex;flex-direction:column;align-items:center;gap:18px;"
    });

    // Logo — 140px, navy drop-shadow so it lifts off any background.
    const logoLink = h('a', {
      href: certUrl, target: '_blank', rel: 'noopener noreferrer',
      style: 'display:inline-block;transition:transform 0.2s ease;'
    });
    const logo = h('img', {
      src: LOGO_URL, alt: 'مشتري موثق',
      style: 'width:140px;height:140px;object-fit:contain;background:transparent;filter:drop-shadow(0 6px 20px rgba(30,42,74,0.3));'
    });
    logoLink.appendChild(logo);
    logoLink.onmouseover = function () { this.style.transform = 'scale(1.05)'; };
    logoLink.onmouseout = function () { this.style.transform = 'scale(1)'; };
    container.appendChild(logoLink);

    // Title — champagne-gold gradient; uses store name when available.
    const titleEl = h('h3', {
      style: "font-size:26px;font-weight:900;margin:0;line-height:1.3;background:linear-gradient(180deg,#d9b879,#8a6d3b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#8a6d3b;display:inline-block;"
    }, titleText);
    container.appendChild(titleEl);

    // Medallion — navy rectangle with gold ring showing verified review count.
    if (hasReviews) {
      const medallion = h('div', {
        style: "display:inline-flex;align-items:center;gap:18px;padding:16px 38px;border-radius:16px;background:linear-gradient(160deg,#2a3860 0%,#17213f 50%,#0a1020 100%);box-shadow:inset 0 1px 0 rgba(232,212,160,0.3),inset 0 -2px 6px rgba(0,0,0,0.55),0 0 0 1.5px #b89968,0 12px 28px -10px rgba(10,16,32,0.4);"
      });
      const numEl = h('div', {
        style: "font-family:'Cairo',system-ui,sans-serif;font-size:52px;font-weight:900;line-height:1;letter-spacing:-0.02em;background:linear-gradient(180deg,#fff8e1,#f0dcab 30%,#c9a86c 70%,#8a6d3b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 0 rgba(10,16,32,0.8));"
      }, String(verifiedCount));
      const lblEl = h('div', {
        style: "font-family:'Cairo',system-ui,sans-serif;font-size:14px;font-weight:800;letter-spacing:0.12em;background:linear-gradient(180deg,#f0dcab,#b89968);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;"
      }, 'تقييم موثق');
      medallion.appendChild(numEl);
      medallion.appendChild(lblEl);
      container.appendChild(medallion);
    }

    // Subtitle — mid-slate; switches to "no reviews yet" copy when count is 0.
    const subtitleEl = h('p', {
      style: "font-size:13.5px;font-weight:600;color:#475569;margin:0;line-height:1.75;max-width:440px;"
    }, subtitleText);
    container.appendChild(subtitleEl);

    // Cert-number chip — gold-outlined capsule, reads as an official seal.
    if (code) {
      const certChip = h('div', {
        style: "margin:4px 0 0;padding:7px 18px;border-radius:999px;border:1px solid rgba(184,153,104,0.55);color:#8a6d3b;font-family:'Cairo',system-ui,sans-serif;font-size:10.5px;font-weight:700;letter-spacing:0.22em;display:inline-flex;align-items:center;gap:8px;"
      });
      certChip.appendChild(document.createTextNode('رقم الشهادة · '));
      const codeEl = h('span', {
        style: "font-family:'Courier New',ui-monospace,monospace;font-weight:700;letter-spacing:0.08em;color:inherit;"
      }, code);
      certChip.appendChild(codeEl);
      container.appendChild(certChip);
    }

    // Smart placement (Salla-style heuristics, ordered by priority)
    const placement = findBestZidPlacement();
    if (!placement) return;

    if (placement.type === 'floating') {
      container.style.cssText += 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:320px;background:white;box-shadow:0 10px 40px rgba(0,0,0,0.15);border-radius:16px;';
      document.body.appendChild(container);
      return;
    }

    const el = placement.element;
    if (placement.position === 'before') el.parentNode.insertBefore(container, el);
    else el.parentNode.insertBefore(container, el.nextSibling);

    // Defense-in-depth: if somehow landed inside a card, eject to floating.
    if (container.closest(UNSAFE_ANCESTORS)) {
      container.remove();
      container.style.cssText += 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:320px;background:white;box-shadow:0 10px 40px rgba(0,0,0,0.15);border-radius:16px;';
      document.body.appendChild(container);
    }
  }

  // Nodes whose descendants must never host the badge.
  const UNSAFE_ANCESTORS = [
    '.product-card', '.product-item', '.product-box',
    '[data-product-id]', '[data-product-sku]',
    '.card', '.swiper-slide',
    '.list-group-item',
  ].join(',');

  const isVisible = (el) => !!(el && el.offsetParent !== null);
  const isSafe = (el) => el && !el.closest(UNSAFE_ANCESTORS);
  const pick = (sel) => {
    for (const el of document.querySelectorAll(sel)) {
      if (isVisible(el) && isSafe(el)) return el;
    }
    return null;
  };

  // ——— Heuristic: best page-level anchor, never inside a product card ———
  function findBestZidPlacement() {
    // Priority 1 — Product detail: directly after the reviews list.
    //             Only matches a .list-group that actually holds review rows.
    const reviewsList = (() => {
      for (const lg of document.querySelectorAll('.tab-pane .list-group, #nav-tabContent .list-group, .list-group')) {
        if (!isVisible(lg) || !isSafe(lg)) continue;
        if (lg.querySelector('small[data-time]')) return lg;
      }
      return null;
    })();
    if (reviewsList) return { element: reviewsList, position: 'after' };

    // Priority 2 — Product detail: after the description/info blocks.
    const productDesc = pick('#description, #nav-description, .product-description, [data-product-description]');
    if (productDesc) return { element: productDesc, position: 'after' };

    const productInfo = pick('.product-details, .product-single, .product-show, .product-info');
    if (productInfo) return { element: productInfo, position: 'after' };

    // Priority 3 — Storefront / category / home: right above the site footer.
    const footer = pick('footer, .footer, .site-footer, .store-footer');
    if (footer) return { element: footer, position: 'before' };

    // Priority 4 — Very last <main> child, still outside any card.
    const mainTail = pick('main > section:last-of-type, main > div:last-of-type, #app-body > :last-child, #content > :last-child');
    if (mainTail) return { element: mainTail, position: 'after' };

    // Fallback — floating pill (guaranteed outside the grid).
    return { type: 'floating' };
  }

  // ——— Add logos to Zid reviews ———
  async function addLogosToZidReviews(verifiedReviews, storeUid) {
    if (!Array.isArray(verifiedReviews) || verifiedReviews.length === 0) return;

    // Build hash → reviewId map from API response
    const hashMap = new Map();
    for (const r of verifiedReviews) {
      if (r.zidDomHash) {
        hashMap.set(r.zidDomHash, r.reviewId || null);
      }
    }
    if (hashMap.size === 0) return;

    // Find all review items anchored by data-time (resilient to theme changes)
    const dateAnchors = document.querySelectorAll('small[data-time]');

    for (const dateEl of dateAnchors) {
      // Walk up to find the review container
      const reviewContainer = dateEl.closest('.list-group-item') ||
        dateEl.parentElement?.parentElement?.parentElement;
      if (!reviewContainer) continue;

      // Skip if already badged
      if (reviewContainer.querySelector('.theqah-verified-logo')) continue;

      // Extract author name and data-time
      const nameEl = reviewContainer.querySelector('.fw-bold.px-1') ||
        reviewContainer.querySelector('[class*="fw-bold"]') ||
        reviewContainer.querySelector('span:last-child');
      const authorName = nameEl?.textContent?.trim();
      const createdAt = dateEl.getAttribute('data-time');

      if (!authorName || !createdAt) continue;

      // Compute hash and check against verified set
      const hash = await domHash(authorName, createdAt);
      if (!hashMap.has(hash)) continue;

      const publicReviewId = hashMap.get(hash);

      // Build review link URL
      const reviewUrl = publicReviewId
        ? `${SCRIPT_ORIGIN}/store/${encodeURIComponent(storeUid)}/reviews?review=${encodeURIComponent(publicReviewId)}`
        : `${SCRIPT_ORIGIN}/store/${encodeURIComponent(storeUid)}/reviews`;

      // Find insertion point — prefer the name area
      const insertPoint = reviewContainer.querySelector('small.overflow-hidden') ||
        nameEl?.parentElement ||
        reviewContainer;

      // Create logo element
      const logoLink = document.createElement('a');
      logoLink.href = reviewUrl;
      logoLink.target = '_blank';
      logoLink.rel = 'noopener noreferrer';
      logoLink.title = 'مشتري موثق - عرض التقييم الموثق';
      logoLink.style.cssText = 'display:inline-flex;align-items:center;text-decoration:none;transition:transform 0.2s ease;margin-inline-start:8px;';
      logoLink.onmouseover = function () { this.style.transform = 'scale(1.1)'; };
      logoLink.onmouseout = function () { this.style.transform = 'scale(1)'; };

      const logoImg = document.createElement('img');
      logoImg.src = LOGO_URL;
      logoImg.className = 'theqah-verified-logo';
      logoImg.alt = 'مشتري موثق - Verified Buyer';
      logoImg.style.cssText = 'width:60px;height:60px;margin:0 8px;display:inline-block;vertical-align:middle;cursor:pointer;background:transparent;';

      logoLink.appendChild(logoImg);
      insertPoint.style.display = 'flex';
      insertPoint.style.alignItems = 'center';
      insertPoint.style.gap = '8px';
      insertPoint.appendChild(logoLink);
    }
  }

  // ——— Fetch verified reviews and inject logos ———
  async function fetchAndAddLogos(storeUid) {
    try {
      const productId = extractProductId();
      const result = await checkVerifiedReviews(storeUid, productId);

      if (result.hasVerified && result.reviews?.length > 0) {
        // Inject JSON-LD schema for AI search engines
        injectReviewSchemaJsonLd(result.reviews, storeUid);

        G.verifiedReviews = result.reviews;
        await addLogosToZidReviews(result.reviews, storeUid);

        // Retry for late-rendered reviews (tab switching, lazy loading)
        const retryDelays = [500, 1500, 3000, 5000];
        retryDelays.forEach(delay => {
          setTimeout(() => {
            const expected = result.reviews.filter(r => r.zidDomHash).length;
            const current = document.querySelectorAll('.theqah-verified-logo').length;
            if (current < expected) {
              addLogosToZidReviews(result.reviews, storeUid);
            }
          }, delay);
        });
      }
    } catch { /* silent */ }
  }

  // ——— Main flow (with re-entry guard) ———
  async function main() {
    if (mainRunning) return;
    mainRunning = true;

    try {
      const storeData = await resolveStore();
      if (!storeData?.storeUid) return;

      const storeUid = storeData.storeUid;
      G.storeUid = storeUid;

      // Store profile (name + verified count) — cached per storeUid.
      if (!G.storeProfile || G.storeProfile._storeUid !== storeUid) {
        const profile = await fetchStoreProfile(storeUid);
        G.storeProfile = profile
          ? { ...profile, _storeUid: storeUid }
          : { storeName: null, verifiedCount: null, _storeUid: storeUid };
      }

      // Certificate badge
      insertCertificateBadge(storeUid, G.storeProfile);

      // Verified review logos
      await fetchAndAddLogos(storeUid);
    } catch { /* silent */ }
    finally {
      mainRunning = false;
    }
  }

  // ——— Re-add logos (for tab switches, no full re-run) ———
  const reAddLogos = debounce(() => {
    if (G.verifiedReviews?.length > 0 && G.storeUid) {
      addLogosToZidReviews(G.verifiedReviews, G.storeUid);
    } else if (G.storeUid) {
      fetchAndAddLogos(G.storeUid);
    }
  }, 300);

  // ——— Launch ———
  const launch = () => {
    main().catch(() => { }).finally(() => { window.__THEQAH_ZID_LOADING__ = false; });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launch);
  } else {
    setTimeout(launch, 100);
  }

  // ——— Smart MutationObserver ———
  if (!window.__THEQAH_ZID_OBS__ && typeof MutationObserver !== 'undefined') {
    window.__THEQAH_ZID_OBS__ = true;

    const debouncedMain = debounce(() => {
      if (!document.querySelector('.theqah-zid-certificate')) main();
    }, 1000);

    const obs = new MutationObserver((mutations) => {
      let certRemoved = false;
      let reviewChanges = false;

      for (const m of mutations) {
        // Check for certificate removal
        for (const n of m.removedNodes) {
          if (n.nodeType === 1 && n.classList?.contains('theqah-zid-certificate')) {
            certRemoved = true;
          }
        }

        // Detect review elements being added (Zid reviews use list-group-item with data-time)
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            if (n.querySelector?.('small[data-time]') || n.matches?.('small[data-time]')) {
              reviewChanges = true;
            }
          }
        }

        // Detect tab panel visibility changes
        if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
          const target = m.target;
          if (target?.classList?.contains('tab-pane') && target.querySelector?.('small[data-time]')) {
            reviewChanges = true;
          }
        }
      }

      if (certRemoved) debouncedMain();
      if (reviewChanges) reAddLogos();
    });

    try {
      obs.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden'],
        characterData: false,
      });
      setTimeout(() => { obs.disconnect(); window.__THEQAH_ZID_OBS__ = false; }, 300000);
    } catch { /* silent */ }

    // Listen for Zid reviews tab clicks
    try {
      document.addEventListener('click', (e) => {
        const tab = e.target?.closest?.('[role="tab"], .nav-link, [data-bs-toggle="tab"]');
        if (!tab) return;
        const text = (tab.textContent || '').trim();
        if (/تقييم|التقييمات|reviews?|ratings?/i.test(text)) {
          setTimeout(() => reAddLogos(), 500);
          setTimeout(() => reAddLogos(), 1500);
        }
      }, true);
    } catch { /* silent */ }
  }
})();

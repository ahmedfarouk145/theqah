(() => {
  'use strict';

  const VERSION = '1.0.5'; // محسن للـ performance
  
  // حماية من التشغيل المتعدد
  if (window.__THEQAH_STARS_LOADING__) return;
  window.__THEQAH_STARS_LOADING__ = true;

  // أصل السكربت
  const CURRENT = document.currentScript;
  const ORIGIN = (() => {
    try { return new URL(CURRENT?.src || location.href).origin; }
    catch { return location.origin; }
  })();

  const API_BASE = `${ORIGIN}/api/public/reviews`;
  const G = (window.__THEQAH__ = window.__THEQAH__ || {});
  const TTL = 10 * 60 * 1000; // 10 دقائق كاش للـ resolve

  // ---------- 1) auto-resolve للمتجر ----------
  async function resolveStore() {
    const host = location.host.replace(/^www\./, '').toLowerCase();

    // لو متخزن في الذاكرة
    if (G.storeUid) return G.storeUid;

    // لو متخزن في localStorage
    const cacheKey = `theqah:storeUid:${host}`;
    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (saved && saved.uid && Date.now() - saved.t < TTL) {
        G.storeUid = saved.uid;
        return saved.uid;
      }
    } catch {}

    // لو في request شغال دلوقتي
    if (G._starsResolvePromise) return G._starsResolvePromise;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 ثواني للنجوم

    const url = `${API_BASE}/resolve?host=${encodeURIComponent(host)}&href=${encodeURIComponent(location.href)}&v=${encodeURIComponent(VERSION)}`;
    G._starsResolvePromise = fetch(url, { 
        cache: 'no-store',
        signal: controller.signal
      })
      .then(r => {
        clearTimeout(timeoutId);
        return r.ok ? r.json() : null;
      })
      .then(j => {
        const uid = j?.storeUid || null;
        if (uid) {
          G.storeUid = uid;
          try { localStorage.setItem(cacheKey, JSON.stringify({ uid, t: Date.now() })); } catch {}
        }
        return uid;
      })
      .catch(e => {
        clearTimeout(timeoutId);
        console.warn('Stars resolve failed:', e.message);
        return null;
      })
      .finally(() => { G._starsResolvePromise = null; });

    return G._starsResolvePromise;
  }

  // ---------- 2) كشف رقم المنتج (سلة أولاً) ----------
  function detectProductId() {
    // سلة نفسها
    try {
      const sProduct =
        window?.salla?.config?.get?.('product') ||
        window?.salla?.product ||
        window?.__SALLA_PRODUCT__;
      if (sProduct && sProduct.id) return String(sProduct.id);
    } catch {}

    // URL patterns
    const url = location.pathname;
    const patterns = [
      /\/p(\d{7,})/,
      /product[_-](\d{7,})/i,
      /\/products\/(\d{7,})/,
      /\/(\d{7,})$/
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m) return m[1];
    }

    // query
    const q = new URLSearchParams(location.search);
    const pid = q.get('product') || q.get('id') || q.get('pid');
    if (pid && /^\d{5,}$/.test(pid)) return pid;

    // JSON-LD
    try {
      const schemas = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of schemas) {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'Product') {
          const val = data.productID || data.sku || data.identifier;
          if (val) return String(val);
        }
      }
    } catch {}

    return null;
  }

  // ---------- 3) مكان التركيب تحت العنوان ----------
  function findAnchor() {
    const selectors = [
      '.product-details__title',
      '.product-title',
      '.product-name',
      'h1[itemprop="name"]',
      'main h1',
      'body h1'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // fallback: أعلى الصفحة
    return document.body;
  }

  // ---------- 4) جلب الإحصائيات ----------
  async function fetchReviewStats(storeId, productId) {
    const cacheKey = `${storeId}:${productId || 'all'}`;
    const now = Date.now();
    const mem = G._starsCache = G._starsCache || {};
    if (mem[cacheKey] && now - mem[cacheKey].t < 5 * 60 * 1000) {
      return mem[cacheKey].data;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 ثواني

    try {
      let url = `${API_BASE}?storeUid=${encodeURIComponent(storeId)}&limit=1000`;
      if (productId) url += `&productId=${encodeURIComponent(productId)}`;

      const res = await fetch(url, { 
        cache: 'no-store', 
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const data = await res.json();
      
      const reviews = data.items || [];
      if (!reviews.length) return null;

      const total = reviews.length;
      const stars = reviews.reduce((s, r) => s + (r.stars || 0), 0);
      const avg = stars / total;

      const stats = {
        count: total,
        average: Math.round(avg * 2) / 2,
        fullStars: Math.floor(avg),
        hasHalfStar: (avg % 1) >= 0.5,
      };

      mem[cacheKey] = { t: now, data: stats };
      return stats;
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('Stars stats fetch failed:', e.message);
      return null;
    }
  }

  // ---------- 5) CSS ----------
  function injectCSS() {
    if (document.getElementById('theqah-stars-css')) return;
    const style = document.createElement('style');
    style.id = 'theqah-stars-css';
    style.textContent = `
      .theqah-stars-widget{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;display:flex;align-items:center;gap:6px;margin:8px 0}
      .theqah-stars{display:flex;gap:2px}
      .theqah-star{font-size:16px;line-height:1}
      .theqah-star.filled{color:#fbbf24}
      .theqah-star.half{background:linear-gradient(90deg,#fbbf24 50%,#d1d5db 50%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .theqah-star.empty{color:#d1d5db}
      .theqah-count{color:#6b7280;font-size:13px}
      .theqah-badge{display:flex;align-items:center;gap:3px;background:#ecfdf5;color:#059669;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:600}
      .theqah-loading{font-size:12px;color:#9ca3af}
    `;
    document.head.appendChild(style);
  }

  function createStarsHTML(stats, theme, lang) {
    const { count, fullStars, hasHalfStar } = stats;
    const isArabic = (lang || 'ar') === 'ar';
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) stars += '<span class="theqah-star filled">★</span>';
      else if (i === fullStars + 1 && hasHalfStar) stars += '<span class="theqah-star half">★</span>';
      else stars += '<span class="theqah-star empty">☆</span>';
    }
    const reviewText = isArabic
      ? (count === 1 ? 'تقييم واحد' : `${count} تقييمات`)
      : (count === 1 ? '1 review' : `${count} reviews`);

    return `
      <div class="theqah-stars-widget" dir="${isArabic ? 'rtl' : 'ltr'}">
        <div class="theqah-stars">${stars}</div>
        <span class="theqah-count">(${reviewText})</span>
        <div class="theqah-badge">
          <span>✓</span>
          <span>${isArabic ? 'مشتري موثّق' : 'Verified Buyer'}</span>
        </div>
      </div>
    `;
  }

  // ---------- 6) الـ mount ----------
  async function mount() {
    injectCSS();

    const script = document.querySelector('script[data-theqah-stars]') || CURRENT;
    const lang = script?.dataset?.lang || 'ar';
    const theme = script?.dataset?.theme || 'light';
    let store = script?.dataset?.store || '';

    // لو placeholder → تجاهله واستخدم auto-resolve
    if (!store || store.includes('{') || /STORE_ID/i.test(store)) {
      store = await resolveStore();
    }

    if (!store) {
      console.warn('theqah-stars: storeUid not found');
      return;
    }

    const productParam = script?.dataset?.product || 'auto';
    const productId = productParam === 'auto' ? detectProductId() : productParam;

    const anchor = findAnchor();
    const container = document.createElement('div');
    container.innerHTML = '<div class="theqah-loading">...</div>';
    anchor.parentNode.insertBefore(container, anchor.nextSibling);

    const stats = await fetchReviewStats(store, productId);
    if (!stats) {
      container.remove();
      return;
    }
    container.innerHTML = createStarsHTML(stats, theme, lang);
    console.log('[theqah-stars] mounted on', anchor);
  }

  // تشغيل آمن مع حماية
  const safeMount = () => {
    try {
      mount().catch(e => console.warn('Stars mount failed:', e.message));
    } catch (e) {
      console.warn('Stars init failed:', e.message);
    } finally {
      window.__THEQAH_STARS_LOADING__ = false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeMount);
  } else {
    setTimeout(safeMount, 50); // تأخير صغير
  }

  // SPA monitoring محسن
  if (typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver((mutations) => {
      const hasStarsChanges = mutations.some(m =>
        Array.from(m.addedNodes).some(n =>
          n.nodeType === 1 && n.matches?.('[data-theqah-stars]')
        )
      );
      if (hasStarsChanges && !document.querySelector('.theqah-stars-widget')) {
        safeMount();
      }
    });
    
    try {
      obs.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false,
        characterData: false
      });
      
      // إيقاف بعد 20 ثانية
      setTimeout(() => obs.disconnect(), 20000);
    } catch (e) {
      console.warn('Stars observer failed:', e);
    }
  }
})();
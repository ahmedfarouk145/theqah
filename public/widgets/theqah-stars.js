//public/widgets/theqah-stars.js
(() => {
  'use strict';

  const VERSION = '1.0.1';
  const API_BASE = (() => {
    try {
      return new URL(document.currentScript?.src || location.href).origin;
    } catch {
      return location.origin;
    }
  })();

  const cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

  // 👇 هنا خليّته يجرّب ياخد المنتج من سِلّة أولاً
  function detectProductId() {
    // 1) سِلّة
    try {
      const sallaProduct =
        window?.salla?.config?.get?.('product') ||
        window?.salla?.product ||
        window?.__SALLA_PRODUCT__;
      if (sallaProduct && sallaProduct.id) {
        return String(sallaProduct.id);
      }
    } catch (e) {}

    // 2) الباقي زي ما كان
    const url = location.pathname;
    const patterns = [
      /\/p(\d{7,})/,
      /product[_-](\d{7,})/i,
      /\/products\/(\d{7,})/,
      /\/(\d{7,})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    const params = new URLSearchParams(location.search);
    const productParam =
      params.get('product') || params.get('id') || params.get('pid');
    if (productParam && /^\d{7,}$/.test(productParam)) {
      return productParam;
    }

    try {
      const schemas = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (const schema of schemas) {
        const data = JSON.parse(schema.textContent);
        if (data['@type'] === 'Product') {
          const pid = data.productID || data.sku || data.identifier;
          if (pid && /^\d{7,}$/.test(String(pid))) return String(pid);
        }
      }
    } catch (e) {}

    const metaProduct = document.querySelector(
      'meta[property="product:retailer_item_id"], meta[name="product-id"]'
    );
    if (
      metaProduct &&
      metaProduct.content &&
      /^\d{7,}$/.test(metaProduct.content)
    ) {
      return metaProduct.content;
    }

    return null;
  }

  async function fetchReviewStats(storeId, productId) {
    const cacheKey = `${storeId}:${productId || 'all'}`;

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
      cache.delete(cacheKey);
    }

    try {
      let url = `${API_BASE}/api/public/reviews?storeUid=${encodeURIComponent(
        storeId
      )}&limit=1000`;
      if (productId) {
        url += `&productId=${encodeURIComponent(productId)}`;
      }

      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const reviews = data.items || [];

      if (reviews.length === 0) {
        return null;
      }

      const totalReviews = reviews.length;
      const totalStars = reviews.reduce(
        (sum, review) => sum + (review.stars || 0),
        0
      );
      const avgRating = totalStars / totalReviews;

      const stats = {
        count: totalReviews,
        average: Math.round(avgRating * 2) / 2,
        fullStars: Math.floor(avgRating),
        hasHalfStar: (avgRating % 1) >= 0.5
      };

      cache.set(cacheKey, {
        data: stats,
        timestamp: Date.now()
      });

      return stats;
    } catch (error) {
      console.warn('تعذر جلب تقييمات المنتج:', error.message);
      return null;
    }
  }

  function createStarsHTML(stats, theme, lang) {
    const { count, fullStars, hasHalfStar } = stats;
    const isDark = theme === 'dark';
    const isArabic = lang === 'ar';

    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        starsHTML += '<span class="theqah-star filled">★</span>';
      } else if (i === fullStars + 1 && hasHalfStar) {
        starsHTML += '<span class="theqah-star half">★</span>';
      } else {
        starsHTML += '<span class="theqah-star empty">☆</span>';
      }
    }

    const reviewText = isArabic
      ? count === 1
        ? 'تقييم واحد'
        : `${count} تقييمات`
      : count === 1
      ? '1 review'
      : `${count} reviews`;

    const trustedText = isArabic ? 'مشتري موثّق' : 'Verified Buyer';

    return `
      <div class="theqah-stars-widget ${isDark ? 'dark' : 'light'}" dir="${
      isArabic ? 'rtl' : 'ltr'
    }">
        <div class="theqah-stars-content">
          <div class="theqah-stars">${starsHTML}</div>
          <span class="theqah-count">(${reviewText})</span>
          <div class="theqah-badge">
            <span class="theqah-check">✓</span>
            <span class="theqah-badge-text">${trustedText}</span>
          </div>
        </div>
      </div>
    `;
  }

  function injectCSS() {
    if (document.querySelector('#theqah-stars-css')) return;

    const style = document.createElement('style');
    style.id = 'theqah-stars-css';
    style.textContent = `
      .theqah-stars-widget {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        display: flex;
        align-items: center;
        margin: 8px 0;
        font-size: 14px;
        line-height: 1;
      }
      .theqah-stars-content { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .theqah-stars { display:flex; gap:1px; }
      .theqah-star { font-size:16px; line-height:1; transition:transform .2s ease; }
      .theqah-star.filled { color:#fbbf24; }
      .theqah-star.half {
        background: linear-gradient(90deg, #fbbf24 50%, #d1d5db 50%);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
      }
      .theqah-star.empty { color:#d1d5db; }
      .theqah-count { color:#6b7280; font-weight:500; font-size:13px; white-space:nowrap; }
      .theqah-badge {
        display:flex; align-items:center; gap:3px;
        background:#ecfdf5; color:#059669;
        padding:2px 6px; border-radius:10px;
        font-size:11px; font-weight:600; white-space:nowrap;
      }
      .theqah-check { font-size:10px; font-weight:bold; }
      .theqah-stars-widget.dark .theqah-count { color:#9ca3af; }
      .theqah-stars-widget.dark .theqah-badge { background:#064e3b; color:#10b981; }
      .theqah-loading { color:#9ca3af; font-size:12px; padding:4px 0; }
      .theqah-stars-widget:hover .theqah-star.filled { transform:scale(1.1); }
    `;
    document.head.appendChild(style);
  }

  async function mountWidget(script) {
    const storeId = script.dataset.store;
    const productParam = script.dataset.product || 'auto';
    const theme = script.dataset.theme || 'light';
    const lang = script.dataset.lang || 'ar';

    if (!storeId) {
      console.warn('theqah-stars: مطلوب data-store');
      return;
    }
    if (storeId.includes('{') || /STORE_ID/i.test(storeId)) {
      console.warn('theqah-stars: استبدل placeholder برقم المتجر');
      return;
    }

    const productId = productParam === 'auto' ? detectProductId() : productParam;

    const container = document.createElement('div');
    container.innerHTML = '<div class="theqah-loading">جاري التحميل...</div>';
    script.parentNode.insertBefore(container, script.nextSibling);

    try {
      const stats = await fetchReviewStats(storeId, productId);
      if (!stats) {
        container.remove();
        return;
      }
      container.innerHTML = createStarsHTML(stats, theme, lang);
    } catch (err) {
      console.warn('theqah-stars error:', err);
      container.remove();
    }
  }

  function initWidgets() {
    const scripts = document.querySelectorAll(
      'script[data-theqah-stars]:not([data-processed])'
    );
    scripts.forEach((script) => {
      script.dataset.processed = 'true';
      mountWidget(script);
    });
  }

    function init() {
      injectCSS();
      initWidgets();
  
      const observer = new MutationObserver(() => {
        setTimeout(initWidgets, 80);
      });
      observer.observe(document.body, { childList: true, subtree: true });
  
      // Also try to initialize when the document is loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidgets);
      } else {
        // already loaded
        initWidgets();
      }
      window.addEventListener('load', initWidgets);
    }
  
    // kick off
    init();
  })();

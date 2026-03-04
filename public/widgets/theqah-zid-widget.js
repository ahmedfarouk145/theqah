// public/widgets/theqah-zid-widget.js
// Zid-specific widget with extensive debug logging
(() => {
    const SCRIPT_VERSION = "1.0.0-zid-debug";
    const TAG = "[THEQAH-ZID]";

    // Prevent double load
    if (window.__THEQAH_ZID_LOADING__) return;
    window.__THEQAH_ZID_LOADING__ = true;

    console.log(`${TAG} 🚀 Widget loading... v${SCRIPT_VERSION}`);
    console.log(`${TAG} Location:`, {
        href: location.href,
        host: location.host,
        pathname: location.pathname,
        origin: location.origin,
    });

    // ——— Script origin (always use www) ———
    const CURRENT_SCRIPT = document.currentScript;
    const SCRIPT_ORIGIN = (() => {
        try {
            const origin = new URL(CURRENT_SCRIPT?.src || location.href).origin;
            const fixed = origin.replace('://theqah.com.sa', '://www.theqah.com.sa');
            console.log(`${TAG} Script origin: ${origin} → ${fixed}`);
            return fixed;
        } catch (e) {
            console.error(`${TAG} Failed to parse script origin:`, e);
            return 'https://www.theqah.com.sa';
        }
    })();

    const API_RESOLVE = `${SCRIPT_ORIGIN}/api/public/reviews/resolve`;
    const API_CHECK = `${SCRIPT_ORIGIN}/api/reviews/check-verified`;
    const LOGO_URL = `${SCRIPT_ORIGIN}/widgets/logo.png?v=3`;

    console.log(`${TAG} API endpoints:`, { API_RESOLVE, API_CHECK, LOGO_URL });

    // ——— Helpers ———
    const h = (tag, attrs = {}, children = []) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (k === "class") el.className = v;
            else if (k === "html") el.innerHTML = v;
            else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
            else el.setAttribute(k, v);
        }
        (Array.isArray(children) ? children : [children])
            .filter(Boolean)
            .forEach((c) => (typeof c === "string" ? el.appendChild(document.createTextNode(c)) : el.appendChild(c)));
        return el;
    };

    // ——— Step 1: Resolve store ———
    async function resolveStore() {
        const host = location.host.replace(/^www\./, '').toLowerCase();
        console.log(`${TAG} [RESOLVE] Resolving store for host: ${host}`);

        const url = `${API_RESOLVE}?host=${encodeURIComponent(host)}&href=${encodeURIComponent(location.href)}&v=${encodeURIComponent(SCRIPT_VERSION)}`;
        console.log(`${TAG} [RESOLVE] Fetching: ${url}`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const r = await fetch(url, { cache: 'no-store', signal: controller.signal });
            clearTimeout(timeout);

            console.log(`${TAG} [RESOLVE] Response status: ${r.status} ${r.statusText}`);
            console.log(`${TAG} [RESOLVE] Response headers:`, {
                'content-type': r.headers.get('content-type'),
                'access-control-allow-origin': r.headers.get('access-control-allow-origin'),
            });

            if (!r.ok) {
                const text = await r.text();
                console.error(`${TAG} [RESOLVE] Error response:`, text.substring(0, 500));
                return null;
            }

            const data = await r.json();
            console.log(`${TAG} [RESOLVE] ✅ Store resolved:`, data);
            return data;
        } catch (err) {
            console.error(`${TAG} [RESOLVE] ❌ Fetch failed:`, err.message || err);
            return null;
        }
    }

    // ——— Step 2: Detect page type and DOM structure ———
    function analyzePageDOM() {
        console.log(`${TAG} [DOM] Analyzing page structure...`);

        // Zid-specific selectors
        const zidSelectors = {
            'product-page': '.product-page, .product-details-page, [class*="product"]',
            'product-title': '.product-title, .product-name, h1',
            'product-price': '.product-price, [class*="price"]',
            'product-description': '.product-description, [class*="description"]',
            'product-images': '.product-images, .product-gallery, [class*="gallery"]',
            'reviews-section': '[class*="review"], [class*="comment"], [class*="rating"], [data-reviews]',
            'tabs': '[role="tab"], .tab, .tabs, [class*="tab"]',
            'footer': 'footer, [class*="footer"]',
            'main-content': 'main, .main, #main, [role="main"]',
            'container': '.container, .wrapper, [class*="container"]',
        };

        const results = {};
        for (const [name, selector] of Object.entries(zidSelectors)) {
            const els = document.querySelectorAll(selector);
            results[name] = {
                count: els.length,
                elements: Array.from(els).slice(0, 3).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    id: el.id || null,
                    class: typeof el.className === 'string' ? el.className.substring(0, 100) : null,
                    visible: el.offsetParent !== null,
                    rect: el.getBoundingClientRect(),
                })),
            };
        }

        console.log(`${TAG} [DOM] Page structure:`, results);

        // Log all class names on the body for debugging
        const bodyClasses = document.body.className;
        console.log(`${TAG} [DOM] Body classes: "${bodyClasses}"`);

        // Check what's in the main content area
        const allH1 = document.querySelectorAll('h1');
        console.log(`${TAG} [DOM] H1 elements:`, Array.from(allH1).map(el => el.textContent?.trim().substring(0, 50)));

        // Check if there are any existing Theqah elements
        const theqahElements = document.querySelectorAll('[class*="theqah"], [id*="theqah"]');
        console.log(`${TAG} [DOM] Existing Theqah elements: ${theqahElements.length}`);

        return results;
    }

    // ——— Step 3: Find best placement for certificate badge ———
    function findZidPlacement() {
        console.log(`${TAG} [PLACEMENT] Finding best placement...`);

        // Zid-specific placement order
        const candidates = [
            // Zid reviews sections
            { selector: '[class*="review"]', position: 'before', name: 'reviews section' },
            { selector: '[class*="comment"]', position: 'before', name: 'comments section' },
            // Zid product description
            { selector: '.product-description', position: 'after', name: 'product description' },
            { selector: '[class*="description"]', position: 'after', name: 'description area' },
            // Zid product details
            { selector: '.product-details', position: 'after', name: 'product details' },
            { selector: '[class*="product-info"]', position: 'after', name: 'product info' },
            // Tabs content
            { selector: '.tab-content, .tabs-content, [class*="tab-content"]', position: 'after', name: 'tabs content' },
            // Generic product area
            { selector: '.product-page, [class*="product"]', position: 'after', name: 'product page' },
            // Main content
            { selector: 'main, .main, #main', position: 'after', name: 'main content' },
            // Before footer
            { selector: 'footer', position: 'before', name: 'footer' },
        ];

        for (const candidate of candidates) {
            const el = document.querySelector(candidate.selector);
            if (el && el.offsetParent !== null) {
                console.log(`${TAG} [PLACEMENT] ✅ Found: ${candidate.name} (${candidate.selector})`, {
                    tag: el.tagName.toLowerCase(),
                    id: el.id,
                    class: typeof el.className === 'string' ? el.className.substring(0, 80) : '',
                    visible: true,
                });
                return { element: el, position: candidate.position, name: candidate.name };
            }
        }

        console.warn(`${TAG} [PLACEMENT] ⚠️ No placement found, will use floating badge or append to body`);
        return null;
    }

    // ——— Step 4: Create and insert certificate badge ———
    function createCertificateBadge() {
        console.log(`${TAG} [BADGE] Creating certificate badge...`);

        // Check if already exists
        if (document.querySelector('.theqah-zid-certificate')) {
            console.log(`${TAG} [BADGE] Already exists, skipping`);
            return null;
        }

        // Inject Cairo Font
        if (!document.getElementById('theqah-font-cairo')) {
            const link = document.createElement('link');
            link.id = 'theqah-font-cairo';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap';
            document.head.appendChild(link);
        }

        const container = h('div', {
            class: 'theqah-zid-certificate',
            style: `
        font-family: 'Cairo', system-ui, -apple-system, sans-serif;
        direction: rtl;
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

        const logoLink = h('a', {
            href: 'https://www.theqah.com.sa?ref=zid-widget',
            target: '_blank',
            rel: 'noopener noreferrer',
            style: 'display:inline-block;margin-bottom:20px;transition:transform 0.2s ease;',
        });

        const logo = h('img', {
            src: LOGO_URL,
            alt: 'مشتري موثق',
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

        const title = h('h3', {
            style: `
        font-size: 28px;
        font-weight: 900;
        margin: 0 0 12px 0;
        line-height: 1.3;
        background: linear-gradient(to left, #10b981, #3b82f6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        color: #10b981;
        display: inline-block;
      `
        }, 'شهادة توثيق التقييمات');

        const subtitle = h('p', {
            style: `
        font-size: 15px;
        font-weight: 600;
        color: #4b5563;
        margin: 0;
        line-height: 1.6;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
      `
        }, 'جميع تقييمات هذا المتجر مدققة من مشتري موثق "طرف ثالث" لضمان المصداقية');

        container.appendChild(logoLink);
        container.appendChild(title);
        container.appendChild(subtitle);

        console.log(`${TAG} [BADGE] ✅ Badge created`);
        return container;
    }

    function insertBadge(badge) {
        if (!badge) return false;

        const placement = findZidPlacement();

        if (placement) {
            try {
                if (placement.position === 'before') {
                    placement.element.parentNode.insertBefore(badge, placement.element);
                } else {
                    placement.element.parentNode.insertBefore(badge, placement.element.nextSibling);
                }
                console.log(`${TAG} [INSERT] ✅ Badge inserted ${placement.position} "${placement.name}"`);
                return true;
            } catch (err) {
                console.error(`${TAG} [INSERT] ❌ Failed to insert at ${placement.name}:`, err);
            }
        }

        // Fallback: floating badge
        console.log(`${TAG} [INSERT] Using floating badge fallback`);
        badge.style.cssText += `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 320px;
      background: white;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      border-radius: 16px;
    `;
        document.body.appendChild(badge);
        console.log(`${TAG} [INSERT] ✅ Floating badge appended to body`);
        return true;
    }

    // ——— Step 5: Check verified reviews ———
    async function checkVerified(storeUid) {
        console.log(`${TAG} [VERIFIED] Checking verified reviews for: ${storeUid}`);

        try {
            const url = `${API_CHECK}?storeId=${encodeURIComponent(storeUid)}`;
            console.log(`${TAG} [VERIFIED] Fetching: ${url}`);

            const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
            console.log(`${TAG} [VERIFIED] Response: ${r.status} ${r.statusText}`);

            if (!r.ok) {
                const text = await r.text();
                console.error(`${TAG} [VERIFIED] Error:`, text.substring(0, 300));
                return null;
            }

            const data = await r.json();
            console.log(`${TAG} [VERIFIED] Result:`, {
                hasVerified: data.hasVerified,
                reviewCount: data.reviews?.length || 0,
                reviews: data.reviews?.slice(0, 3),
            });
            return data;
        } catch (err) {
            console.error(`${TAG} [VERIFIED] ❌ Failed:`, err.message || err);
            return null;
        }
    }

    // ——— Main flow ———
    async function main() {
        console.log(`${TAG} ═══════════════════════════════════`);
        console.log(`${TAG} 🏁 MAIN FLOW STARTING`);
        console.log(`${TAG} ═══════════════════════════════════`);

        // Step 1: Analyze DOM
        const domInfo = analyzePageDOM();

        // Step 2: Resolve store
        const storeData = await resolveStore();

        if (!storeData || !storeData.storeUid) {
            console.error(`${TAG} ❌ Store not resolved. Widget will not mount.`);
            console.log(`${TAG} Possible causes:`);
            console.log(`${TAG}   1. Domain not registered in Theqah`);
            console.log(`${TAG}   2. CORS blocking the resolve request`);
            console.log(`${TAG}   3. Store subscription expired`);
            return;
        }

        const storeUid = storeData.storeUid;
        console.log(`${TAG} ✅ Store UID: ${storeUid}`);

        // Step 3: Insert certificate badge
        const badge = createCertificateBadge();
        const badgeInserted = insertBadge(badge);
        console.log(`${TAG} Badge inserted: ${badgeInserted}`);

        // Step 4: Check verified reviews
        const verifiedData = await checkVerified(storeUid);

        if (verifiedData?.hasVerified && verifiedData.reviews?.length > 0) {
            console.log(`${TAG} ✅ Found ${verifiedData.reviews.length} verified reviews`);
            // TODO: Add Zid-specific review logo injection when Zid review DOM structure is known
            console.log(`${TAG} [TODO] Zid review logo injection — need to identify Zid review elements`);

            // Log all potential review elements for analysis
            const reviewLikeElements = document.querySelectorAll(
                '[class*="review"], [class*="comment"], [class*="rating"], [class*="feedback"]'
            );
            console.log(`${TAG} [REVIEWS] Found ${reviewLikeElements.length} review-like elements:`);
            Array.from(reviewLikeElements).forEach((el, i) => {
                console.log(`${TAG} [REVIEWS]  ${i}: <${el.tagName.toLowerCase()} id="${el.id}" class="${typeof el.className === 'string' ? el.className.substring(0, 80) : ''}">`);
            });
        } else {
            console.log(`${TAG} ℹ️ No verified reviews found for this store`);
        }

        console.log(`${TAG} ═══════════════════════════════════`);
        console.log(`${TAG} 🏁 MAIN FLOW COMPLETE`);
        console.log(`${TAG} ═══════════════════════════════════`);
    }

    // ——— Launch ———
    const launch = () => {
        console.log(`${TAG} Document readyState: ${document.readyState}`);
        main().catch(err => {
            console.error(`${TAG} ❌ Unexpected error in main():`, err);
        }).finally(() => {
            window.__THEQAH_ZID_LOADING__ = false;
        });
    };

    if (document.readyState === "loading") {
        console.log(`${TAG} Waiting for DOMContentLoaded...`);
        document.addEventListener("DOMContentLoaded", launch);
    } else {
        console.log(`${TAG} DOM ready, launching in 200ms...`);
        setTimeout(launch, 200);
    }

    // Re-run on SPA navigation
    if (typeof MutationObserver !== 'undefined') {
        let debounceTimer;
        const obs = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (!document.querySelector('.theqah-zid-certificate')) {
                    console.log(`${TAG} [OBSERVER] Certificate removed, re-running...`);
                    main().catch(() => { });
                }
            }, 2000);
        });

        try {
            obs.observe(document.body, { childList: true, subtree: true });
            // Auto-disconnect after 5 minutes
            setTimeout(() => { obs.disconnect(); }, 300000);
        } catch (e) { /* silent */ }
    }
})();

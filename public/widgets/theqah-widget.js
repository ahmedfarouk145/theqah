(() => {
  const SCRIPT_VERSION = "1.1.0";

  // --- Helpers ---
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

  // --- Renderer for a single placeholder ---
  async function mountOne(hostEl) {
    const store = hostEl.dataset.store?.trim();
    const product = hostEl.dataset.product?.trim() || "";
    const limit = Number(hostEl.dataset.limit || 10);
    const lang = (hostEl.dataset.lang || "ar").toLowerCase(); // ar | en
    const theme = (hostEl.dataset.theme || "light").toLowerCase(); // light | dark

    if (!store) {
      hostEl.textContent = "Missing data-store";
      return;
    }

    // Shadow DOM (falls back to light DOM if not supported)
    const root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;

    // Styles
    const style = h("style", {
      html: `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .wrap { font-family: system-ui, -apple-system, Segoe UI, Tahoma, Arial, sans-serif; direction: ${
          lang === "ar" ? "rtl" : "ltr"
        }; }
        .section { background: ${theme === "dark" ? "#0b1324" : "#fff"};
                   color: ${theme === "dark" ? "#e2e8f0" : "#0f172a"};
                   border: 1px solid ${theme === "dark" ? "#24304a" : "#e5e7eb"};
                   border-radius: 14px; padding: 14px; margin: 10px 0; }
        .header { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
        .logo { width:20px; height:20px; }
        .title { font-weight:700; font-size:14px; margin:0; }
        .meta { font-size:12px; opacity:.75; margin: 0 0 8px 0; }
        .stars { color: #f59e0b; letter-spacing: 2px; font-size: 14px; }
        .star { opacity: .35; }
        .star.filled { opacity: 1; }
        .badge { display:inline-flex; align-items:center; gap:6px; background: #e6f4ea; color:#166534; border:1px solid #86efac;
                 font-size:11px; padding: 3px 8px; border-radius: 999px; }
        .badge.dark { background:#064e3b; color:#bbf7d0; border-color:#10b981; }
        .text { white-space: pre-wrap; line-height:1.6; font-size: 13px; margin:8px 0 0 0; }
        .empty { padding:12px; border:1px dashed ${theme === "dark" ? "#374151" : "#94a3b8"}; border-radius: 12px; font-size:13px; opacity:.8; }
        .row { display:flex; align-items:center; gap:8px; justify-content: space-between; }
        .left { display:flex; align-items:center; gap:8px; }
        .item { background: ${theme === "dark" ? "#0f172a" : "#fff"};
                color: inherit; border: 1px solid ${theme === "dark" ? "#334155" : "#e2e8f0"};
                border-radius: 14px; padding: 14px; margin: 10px 0; }
        .filter { display:flex; align-items:center; gap:8px; margin: 10px 0 0; font-size: 12px; opacity: .8 }
        .filter button { padding: 6px 10px; border-radius: 8px; border: 1px solid ${theme === "dark" ? "#334155" : "#cbd5e1"};
                         background: transparent; color: inherit; cursor: pointer; }
        .filter button.active { background: ${theme === "dark" ? "#1f2937" : "#f1f5f9"}; }
      `,
    });

    // Shell
    const titleText =
      lang === "ar" ? (product ? "آراء المشترين" : "تقييمات المتجر") : product ? "Customer Reviews" : "Store Reviews";

    const container = h("div", { class: "wrap" });
    const section = h("div", { class: "section" }, [
      h("div", { class: "header" }, [
        // غيّر مسار اللوجو لو عندك ملف آخر
        h("img", { class: "logo", src: "./logo.png", alt: "Theqah" }),
        h("p", { class: "title" }, titleText),
      ]),
      product ? h("p", { class: "meta" }, `${lang === "ar" ? "منتج" : "Product"}: ${product}`) : null,
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

    // Events (sort toggle)
    const filterEl = section.querySelector(".filter");
    let currentSort = "desc";
    filterEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      currentSort = btn.getAttribute("data-sort") || "desc";
      filterEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderList(lastData); // re-render with new sort
    });

    // Fetch data
    const base = `/api/public/reviews?storeUid=${encodeURIComponent(store)}&limit=${limit}&sinceDays=365`;
    const endpoint = product ? `${base}&productId=${encodeURIComponent(product)}` : base;

    let lastData = null;

    const list = section.querySelector(".list");

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

      // Optional re-sort on client if the API ignores query param
      items.sort((a, b) =>
        String(currentSort) === "asc"
          ? Number(a.publishedAt || 0) - Number(b.publishedAt || 0)
          : Number(b.publishedAt || 0) - Number(a.publishedAt || 0)
      );

      for (const r of items) {
        const when = r.publishedAt
          ? new Date(r.publishedAt).toLocaleDateString(lang === "ar" ? "ar" : "en")
          : "";
        const trusted = !!r.trustedBuyer;

        const row = h("div", { class: "row" }, [
          h("div", { class: "left" }, [
            Stars(Number(r.stars || 0)),
            trusted
              ? h(
                  "span",
                  { class: "badge" + (theme === "dark" ? " dark" : "") },
                  lang === "ar" ? ["✅ ", "مشتري موثّق"] : ["✅ ", "Verified Buyer"]
                )
              : null,
          ]),
          h("small", { class: "meta" }, when),
        ]);

        const text = h("p", { class: "text" }, String(r.text || "").trim());
        const item = h("div", { class: "item" }, [row, text]);

        list.appendChild(item);
      }
    };

    await fetchData();
  }

  // Mount all placeholders
  function mountAll() {
    document.querySelectorAll('#theqah-reviews:not([data-mounted="1"])').forEach((el) => {
      el.setAttribute("data-mounted", "1");
      mountOne(el);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();

  const obs = new MutationObserver(() => mountAll());
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();

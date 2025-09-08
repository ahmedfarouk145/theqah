import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

function allowCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function jsEscape(s: string) {
  return (s || "").replace(/\\/g,"\\\\").replace(/`/g,"\\`");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "OPTIONS") {
    allowCors(res);
    return res.status(204).end();
  }
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  allowCors(res);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300"); // 5m

  const storeParam = typeof req.query.store === "string" ? req.query.store.trim() : "";
  const color = typeof req.query.color === "string" ? `#${req.query.color.replace(/[^0-9a-fA-F]/g,"")}` : "#10b981"; // Emerald
  const pos   = typeof req.query.pos === "string" ? req.query.pos : "br"; // br | bl

  const db = dbAdmin();

  // 1) نحاول إيجاد المتجر
  let storeUid = "";
  let storeName = "متجرك";
  let publicReviewUrl = ""; // رابط صفحة تقييم/ملف عام – غيّره حسب مسارك

  if (storeParam) {
    // الشكل المتوقّع: salla:9827...
    storeUid = storeParam;
    try {
      const sDoc = await db.collection("stores").doc(storeUid).get();
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = sDoc.data() as any;
      storeName = s?.salla?.storeName || s?.storeName || storeName;

      // لو عندك صفحة عامة للمتجر عندك (مثلاً /s/{id} أو /store/{id})
      publicReviewUrl = `${(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "").replace(/\/+$/,"")}/s/${encodeURIComponent(storeUid)}`;
    } catch {}
  }

  // 2) ودجت بسيط: زر دائري ثابت + نافذة منبثقة تعرض CTA
  const js = `
(function(){
  try {
    if (window.__theqah_widget_loaded__) return;
    window.__theqah_widget_loaded__ = true;

    var color = "${jsEscape(color)}";
    var corner = "${jsEscape(pos)}"; // "br" or "bl"
    var storeUid = "${jsEscape(storeUid)}";
    var storeName = "${jsEscape(storeName)}";
    var reviewUrl = "${jsEscape(publicReviewUrl)}" || window.location.origin;

    // Styles
    var css = \`
#theqah-badge{position:fixed;z-index:2147483000;bottom:18px;\${corner==="bl" ? "left:18px" : "right:18px"};width:56px;height:56px;border-radius:9999px;background:\${color};box-shadow:0 10px 25px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease;}
#theqah-badge:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(0,0,0,.2);}
#theqah-badge svg{width:28px;height:28px;color:#fff}
#theqah-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:saturate(120%) blur(2px);z-index:2147483000;display:none;align-items:center;justify-content:center;padding:16px}
#theqah-card{max-width:420px;width:100%;background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden;transform:translateY(10px);opacity:.98}
#theqah-hdr{background:linear-gradient(135deg,\${color},#059669);padding:18px 20px;color:#fff}
#theqah-hdr h3{margin:0;font-size:18px}
#theqah-body{padding:18px 20px;color:#111827;line-height:1.7}
#theqah-cta{display:inline-flex;align-items:center;gap:8px;background:\${color};color:#fff;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:600}
#theqah-foot{padding:14px 20px;background:#fafafa;color:#6b7280;font-size:12px;display:flex;justify-content:space-between;align-items:center}
#theqah-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:16px;opacity:.9}
\`;

    var style = document.createElement('style');
    style.setAttribute('data-theqah','widget');
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);

    // Badge
    var badge = document.createElement('button');
    badge.id = 'theqah-badge';
    badge.setAttribute('aria-label','تقييمات وثقة');
    badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.9L18.18 22 12 18.77 5.82 22 7 14.17l-5-4.9 6.91-1.01L12 2z" fill="currentColor"/></svg>';
    document.body.appendChild(badge);

    // Modal
    var mask = document.createElement('div');
    mask.id = 'theqah-modal-mask';
    mask.innerHTML = \`
      <div id="theqah-card" role="dialog" aria-modal="true" aria-label="مراجعات ${jsEscape(storeName)}">
        <div id="theqah-hdr">
          <button id="theqah-close" title="إغلاق">✕</button>
          <h3>قيّم تجربتك مع \${storeName}</h3>
        </div>
        <div id="theqah-body">
          <p>سيسعدنا رأيك! اضغط الزر بالأسفل لفتح صفحة التقييم.</p>
          <p><a id="theqah-cta" href="\${reviewUrl}" target="_blank" rel="noopener">التقييم الآن</a></p>
        </div>
        <div id="theqah-foot">
          <span>مدعوم بواسطة ثقة</span>
          <a href="\${reviewUrl}" target="_blank" rel="noopener" style="text-decoration:underline">عرض التقييمات</a>
        </div>
      </div>
    \`;
    document.body.appendChild(mask);

    function openModal(){ mask.style.display='flex'; }
    function closeModal(){ mask.style.display='none'; }

    badge.addEventListener('click', openModal);
    mask.addEventListener('click', function(e){ if(e.target === mask) closeModal(); });
    var btnClose = mask.querySelector('#theqah-close');
    if (btnClose) btnClose.addEventListener('click', closeModal);

    // Pixel (اختياري)
    try {
      var u = new URL((document.currentScript && document.currentScript.src) || location.href);
      var api = u.origin || location.origin;
      var px = api + '/api/public/pixel?store=' + encodeURIComponent(storeUid) + '&p=' + encodeURIComponent(location.pathname);
      var i = new Image(); i.src = px;
    } catch(e){}
  } catch(e) { /* no-op */ }
})();
`;

  res.send(js);
}

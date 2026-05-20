// src/pages/og/share-card-html.tsx
//
// Renders the share-card design as an actual HTML page that the
// /api/og/share-card endpoint screenshots via Chromium. Unlike the
// previous @vercel/og (Satori) approach, this page runs in real
// browser rendering with full bidi, Arabic shaping, RTL flex layout,
// and font fallback — everything Chrome handles natively.

import type { GetServerSideProps } from 'next';
import Head from 'next/head';

interface Props {
  store: string;
  storeLogo: string;
  author: string;
  text: string;
  product: string;
  productImg: string;
  stars: number;
  storeUid: string;
  cert: string;
  handle: string;
}

function certCode(uid: string): string {
  if (!uid) return '';
  let hash = 5381;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash * 33) ^ uid.charCodeAt(i)) >>> 0;
  }
  return 'TQ-' + (hash.toString(36).toUpperCase() + '000000').slice(0, 6);
}

function trimText(s: string, max: number): string {
  if (!s) return '';
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const q = ctx.query;
  const storeUid = String(q.storeUid || '');
  const props: Props = {
    store: trimText(String(q.store || ''), 60) || 'متجر',
    storeLogo: String(q.storeLogo || ''),
    author: trimText(String(q.author || ''), 40) || 'عميل موثق',
    text: trimText(String(q.text || ''), 220),
    product: trimText(String(q.product || ''), 80),
    productImg: String(q.productImg || ''),
    stars: Math.max(1, Math.min(5, parseInt(String(q.stars || '5'), 10) || 5)),
    storeUid,
    cert: certCode(storeUid),
    handle: trimText(String(q.handle || '@theqahapp'), 20),
  };
  ctx.res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  );
  return { props };
};

export default function ShareCardHtml(p: Props) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=1080,initial-scale=1" />
        <title>Theqah Share Card</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="card">
        <div className="gold-rule top" />

        {/* HEADER: store branding (the merchant's own logo + name) — this
            is THEIR review being shared, so their brand is hero-position. */}
        <div className="header">
          <div className="store-brand">
            {p.storeLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.storeLogo} alt="" className="store-logo" />
            )}
            <div className="store-text">
              <div className="store-name-lg">{p.store}</div>
              <div className="store-tagline">تقييم موثق من عميل</div>
            </div>
          </div>
        </div>

        {/* BODY: product image + STARS (prominent) + review quote + author */}
        <div className="body">
          {p.productImg && (
            <div className="product-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.productImg} alt="" />
            </div>
          )}
          <div className="review-col">
            <div className="stars-body" aria-hidden="true">
              {'★'.repeat(p.stars)}
              <span className="empty">{'★'.repeat(5 - p.stars)}</span>
            </div>
            {p.text && <div className="quote">{p.text}</div>}
            <div className="byline">— {p.author}</div>
          </div>
        </div>

        {/* FOOTER: Theqah branding as the verifier / trust footnote */}
        <div className="footer">
          <div className="theqah-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.theqah.com.sa/widgets/logo.png?v=3" alt="" className="theqah-logo" />
            <div>
              <div className="theqah-name">مشتري موثق</div>
              <div className="theqah-tag">VERIFIED · {p.handle}</div>
            </div>
          </div>
          {p.cert && <div className="cert-chip">CERT · {p.cert}</div>}
        </div>

        <div className="gold-rule bottom" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: transparent; }
        body { font-family: 'Cairo', system-ui, sans-serif; }
        .card {
          width: 1080px;
          height: 1080px;
          box-sizing: border-box;
          padding: 70px 80px;
          background: linear-gradient(160deg, #2a3860 0%, #17213f 50%, #0a1020 100%);
          color: #f1f5f9;
          direction: rtl;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        .gold-rule {
          position: absolute;
          left: 0;
          right: 0;
          height: 8px;
          background: linear-gradient(90deg, transparent, #d9b879 20%, #fff8e1 50%, #d9b879 80%, transparent);
        }
        .gold-rule.top { top: 0; }
        .gold-rule.bottom { bottom: 0; }

        /* HEADER — store branding (hero) */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 50px;
        }
        .store-brand { display: flex; align-items: center; gap: 22px; }
        .store-logo {
          width: 110px;
          height: 110px;
          border-radius: 18px;
          object-fit: cover;
          background: white;
          padding: 8px;
          box-shadow: 0 6px 18px -6px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(232, 212, 160, 0.4);
        }
        .store-text { display: flex; flex-direction: column; gap: 6px; }
        .store-name-lg {
          font-size: 46px;
          font-weight: 900;
          color: #f0dcab;
          line-height: 1.1;
          letter-spacing: -0.01em;
        }
        .store-tagline {
          font-size: 16px;
          font-weight: 700;
          color: #cbd5e1;
          letter-spacing: 0.06em;
        }
        .stars-body {
          color: #f0dcab;
          font-size: 72px;
          letter-spacing: 12px;
          direction: ltr;
          line-height: 1;
          margin-bottom: 8px;
        }
        .stars-body .empty { color: rgba(232, 212, 160, 0.25); }

        /* BODY — product + review */
        .body {
          display: flex;
          gap: 36px;
          align-items: center;
          flex: 1;
        }
        .product-frame {
          width: 360px;
          height: 360px;
          border-radius: 24px;
          background: white;
          padding: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: inset 0 0 0 2px rgba(232, 212, 160, 0.4);
        }
        .product-frame img {
          max-width: 316px;
          max-height: 316px;
          object-fit: contain;
        }
        .review-col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .quote {
          font-size: 44px;
          font-weight: 800;
          line-height: 1.45;
          color: #f8fafc;
          text-align: right;
          direction: rtl;
        }
        .quote::before { content: '"'; }
        .quote::after { content: '"'; }
        .byline {
          font-size: 24px;
          font-weight: 700;
          color: #cbd5e1;
          text-align: right;
        }

        /* FOOTER — Theqah verifier */
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 28px;
          border-top: 1px solid rgba(232, 212, 160, 0.25);
          margin-top: 40px;
        }
        .theqah-brand { display: flex; align-items: center; gap: 14px; }
        .theqah-logo { width: 56px; height: 56px; object-fit: contain; }
        .theqah-name {
          font-size: 22px;
          font-weight: 900;
          color: #f0dcab;
          line-height: 1;
        }
        .theqah-tag {
          font-size: 12px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.18em;
          margin-top: 4px;
        }
        .cert-chip {
          border: 2px solid #8a6d3b;
          color: #f0dcab;
          padding: 10px 22px;
          border-radius: 999px;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.2em;
        }
      `}</style>
    </>
  );
}

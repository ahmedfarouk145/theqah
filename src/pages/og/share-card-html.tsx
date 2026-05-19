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

        <div className="header">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.theqah.com.sa/widgets/logo.png?v=3" alt="" />
            <div>
              <div className="brand-text-lg">مشتري موثق</div>
              <div className="brand-text-sm">VERIFIED · {p.handle}</div>
            </div>
          </div>
          {p.cert && <div className="cert-chip">CERT · {p.cert}</div>}
        </div>

        <div className="body">
          {p.productImg && (
            <div className="product-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.productImg} alt="" />
            </div>
          )}
          <div className="review-col">
            <div className="stars" aria-hidden="true">
              {'★'.repeat(p.stars)}
              <span className="empty">{'★'.repeat(5 - p.stars)}</span>
            </div>
            {p.text && <div className="quote">{p.text}</div>}
          </div>
        </div>

        <div className="footer">
          <div>
            <div className="author-name">{p.author}</div>
            <div className="author-meta">
              تقييم موثق · تم التحقق من الشراء
              {p.product ? ` · ${p.product}` : ''}
            </div>
          </div>
          <div className="store-name">{p.store}</div>
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
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
        }
        .brand { display: flex; align-items: center; gap: 20px; }
        .brand img { width: 84px; height: 84px; object-fit: contain; }
        .brand-text-lg {
          font-size: 34px;
          font-weight: 900;
          color: #f0dcab;
          letter-spacing: -0.01em;
          line-height: 1.1;
        }
        .brand-text-sm {
          font-size: 15px;
          font-weight: 700;
          color: #cbd5e1;
          letter-spacing: 0.18em;
          margin-top: 6px;
        }
        .cert-chip {
          border: 2px solid #8a6d3b;
          color: #f0dcab;
          padding: 10px 22px;
          border-radius: 999px;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.2em;
        }
        .body {
          display: flex;
          gap: 36px;
          align-items: center;
          flex: 1;
        }
        .product-frame {
          width: 340px;
          height: 340px;
          border-radius: 24px;
          background: white;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: inset 0 0 0 2px rgba(232, 212, 160, 0.4);
        }
        .product-frame img {
          max-width: 300px;
          max-height: 300px;
          object-fit: contain;
        }
        .review-col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .stars {
          color: #f0dcab;
          font-size: 56px;
          letter-spacing: 10px;
          margin-bottom: 28px;
          text-align: right;
        }
        .stars .empty { color: rgba(232, 212, 160, 0.25); }
        .quote {
          font-size: 40px;
          font-weight: 800;
          line-height: 1.5;
          color: #f8fafc;
          text-align: right;
          direction: rtl;
        }
        .quote::before { content: '"'; }
        .quote::after { content: '"'; }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 32px;
          border-top: 1px solid rgba(232, 212, 160, 0.25);
          margin-top: 36px;
        }
        .author-name {
          font-size: 32px;
          font-weight: 900;
          color: #f1f5f9;
          margin-bottom: 4px;
        }
        .author-meta {
          font-size: 18px;
          color: #cbd5e1;
        }
        .store-name {
          font-size: 32px;
          font-weight: 900;
          color: #f0dcab;
          letter-spacing: 0.02em;
          text-align: left;
          line-height: 1.2;
          max-width: 360px;
        }
      `}</style>
    </>
  );
}

// src/pages/api/og/share-card.tsx
//
// Dynamic Open Graph image for the verified-review share feature.
// Renders a 1080×1080 PNG that the widget hands to Instagram/TikTok as a
// downloadable post asset, and that Twitter/Facebook crawl as the link
// preview when share intent URLs are followed.
//
// Inputs are unsigned query params for now — the widget builds the URL
// from review data it already has client-side. Before production deploy
// we'll add HMAC signing so this endpoint can't be abused to craft fake
// "verified" cards. For testing this stays open.
//
// Endpoint: /api/og/share-card?store=...&stars=5&text=...&author=...
//                              &product=...&productImg=...&handle=@theqahapp
//
// Runtime: Edge — required by `next/og` ImageResponse.

import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const config = { runtime: 'edge' };

const NAVY_1 = '#2a3860';
const NAVY_2 = '#17213f';
const NAVY_3 = '#0a1020';
const GOLD_1 = '#f0dcab';
const GOLD_2 = '#d9b879';
const GOLD_4 = '#8a6d3b';
const GOLD_5 = '#fff8e1';

async function loadCairo(weight: number): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Cairo:wght@${weight}&display=swap`;
  const css = await fetch(cssUrl, {
    headers: {
      // Sending a desktop UA gets us TTF/woff2 served from gstatic.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  }).then((r) => r.text());
  // Pick the Arabic subset block, then the woff2 URL inside it. The
  // file order in the response is: arabic, latin-ext, latin. We want
  // arabic for the Arabic glyphs.
  const arabicBlock = css.match(/\/\* arabic \*\/[\s\S]+?src: url\((.+?)\)/);
  const fontUrl = arabicBlock?.[1] || css.match(/src: url\((.+?)\)/)?.[1];
  if (!fontUrl) throw new Error('Cairo font URL not found');
  const buf = await fetch(fontUrl).then((r) => r.arrayBuffer());
  return buf;
}

function trim(s: string | null, max: number): string {
  if (!s) return '';
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function certCode(uid: string): string {
  if (!uid) return '';
  let hash = 5381;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash * 33) ^ uid.charCodeAt(i)) >>> 0;
  }
  return 'TQ-' + (hash.toString(36).toUpperCase() + '000000').slice(0, 6);
}

export default async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const store = trim(sp.get('store'), 60) || 'متجر';
  const author = trim(sp.get('author'), 40) || 'عميل موثق';
  const review = trim(sp.get('text'), 220) || '';
  const product = trim(sp.get('product'), 80);
  const productImg = sp.get('productImg') || '';
  const handle = trim(sp.get('handle'), 20) || '@theqahapp';
  const storeUid = sp.get('storeUid') || '';
  const stars = Math.max(1, Math.min(5, parseInt(sp.get('stars') || '5', 10) || 5));

  const cert = storeUid ? certCode(storeUid) : '';

  // Load the Cairo Arabic font for both the regular and bold weights.
  // Parallel fetch to keep cold-start fast.
  let cairoRegular: ArrayBuffer | null = null;
  let cairoBold: ArrayBuffer | null = null;
  try {
    [cairoRegular, cairoBold] = await Promise.all([loadCairo(600), loadCairo(900)]);
  } catch {
    /* font fetch failed — ImageResponse will fall back to system font */
  }

  // Absolute production URL for the brand logo. We hardcode www.theqah.com.sa
  // rather than url.origin so that Vercel preview deployments (which are
  // SSO-gated and return HTML 401 pages for asset paths) still get a real
  // PNG to embed. Production prod URL is publicly reachable.
  const brandLogo = `https://www.theqah.com.sa/widgets/logo.png?v=3`;

  // Pre-compose every multi-fragment string so each <div> in the JSX
  // contains exactly one text child. Satori (the @vercel/og renderer)
  // rejects divs with multiple children unless they have an explicit
  // `display: flex`; pre-composing avoids the issue entirely.
  const brandCaption = `VERIFIED · ${handle}`;
  const certText = cert ? `CERT · ${cert}` : '';
  const reviewQuote = review ? `"${review}"` : '';
  const footerSubLine = `تقييم موثق · تم التحقق من الشراء${product ? ` · ${product}` : ''}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1080px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          fontFamily: 'Cairo, system-ui, sans-serif',
          background: `linear-gradient(160deg, ${NAVY_1} 0%, ${NAVY_2} 50%, ${NAVY_3} 100%)`,
          color: '#f1f5f9',
          padding: '70px 80px',
          direction: 'rtl',
        }}
      >
        {/* Top gold rule */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '8px',
            background: `linear-gradient(90deg, transparent, ${GOLD_2} 20%, ${GOLD_5} 50%, ${GOLD_2} 80%, transparent)`,
          }}
        />

        {/* Header: brand + cert chip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {brandLogo && (
              <img
                src={brandLogo}
                width={84}
                height={84}
                alt=""
                style={{ display: 'block' }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontSize: '34px',
                  fontWeight: 900,
                  color: GOLD_1,
                  letterSpacing: '-0.01em',
                }}
              >
                مشتري موثق
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#cbd5e1',
                  letterSpacing: '0.18em',
                }}
              >
                {brandCaption}
              </div>
            </div>
          </div>
          {cert && (
            <div
              style={{
                border: `2px solid ${GOLD_4}`,
                color: GOLD_1,
                padding: '10px 22px',
                borderRadius: '999px',
                fontSize: '17px',
                fontWeight: 800,
                letterSpacing: '0.2em',
                display: 'flex',
              }}
            >
              {certText}
            </div>
          )}
        </div>

        {/* Body: product image + review block side-by-side */}
        <div
          style={{
            display: 'flex',
            gap: '36px',
            alignItems: 'center',
            flex: 1,
          }}
        >
          {productImg ? (
            <div
              style={{
                width: '340px',
                height: '340px',
                borderRadius: '24px',
                background: 'white',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: 'inset 0 0 0 2px rgba(232,212,160,0.4)',
              }}
            >
              <img
                src={productImg}
                alt=""
                width={300}
                height={300}
                style={{ objectFit: 'contain', maxWidth: '300px', maxHeight: '300px' }}
              />
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '28px',
              }}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const filled = i < stars;
                return (
                  <svg
                    key={i}
                    width="56"
                    height="56"
                    viewBox="0 0 24 24"
                    fill={filled ? GOLD_1 : 'rgba(232,212,160,0.25)'}
                    stroke={GOLD_1}
                    strokeWidth={filled ? 0 : 1.5}
                  >
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                );
              })}
            </div>
            <div
              style={{
                fontSize: '40px',
                fontWeight: 800,
                lineHeight: 1.45,
                color: '#f8fafc',
                display: 'flex',
              }}
            >
              {reviewQuote}
            </div>
          </div>
        </div>

        {/* Footer: author + store name */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '32px',
            borderTop: '1px solid rgba(232,212,160,0.25)',
            marginTop: '36px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#f1f5f9' }}>
              {author}
            </div>
            <div style={{ fontSize: '18px', color: '#cbd5e1' }}>
              {footerSubLine}
            </div>
          </div>
          <div
            style={{
              fontSize: '32px',
              fontWeight: 900,
              color: GOLD_1,
              letterSpacing: '0.02em',
            }}
          >
            {store}
          </div>
        </div>

        {/* Bottom gold rule */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '8px',
            background: `linear-gradient(90deg, transparent, ${GOLD_2} 20%, ${GOLD_5} 50%, ${GOLD_2} 80%, transparent)`,
          }}
        />
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: [
        ...(cairoRegular
          ? [{ name: 'Cairo', data: cairoRegular, weight: 600 as const, style: 'normal' as const }]
          : []),
        ...(cairoBold
          ? [{ name: 'Cairo', data: cairoBold, weight: 900 as const, style: 'normal' as const }]
          : []),
      ],
      // Allow the edge to cache this for 1 hour. Same params = same image.
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}

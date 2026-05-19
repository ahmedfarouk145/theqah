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

// Fetches an image and returns a data: URI. We do this ourselves
// rather than let Satori fetch the URL directly because Satori's
// image loader is fragile — it throws "s is not iterable" on certain
// hosts and produces "Unsupported image type: unknown" if a CDN
// returns the bytes with a quirky content-type. By pre-fetching and
// inlining as base64 we bypass Satori's loader entirely.
async function fetchImageAsDataUri(rawUrl: string): Promise<string | null> {
  if (!rawUrl) return null;
  // Strip any whitespace that may have been injected by URL paste / log
  // truncation — the actual asset never contains whitespace in its path.
  const clean = rawUrl.replace(/\s+/g, '').trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  try {
    const r = await fetch(clean, {
      // Some CDNs (incl. Salla) gate hotlinking on a plausible UA;
      // a desktop Chrome UA gets us a normal image response.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/png').split(';')[0].trim();
    const buf = await r.arrayBuffer();
    // Buffer is available in modern Edge runtime on Vercel.
    const b64 = Buffer.from(buf).toString('base64');
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

// Load all Cairo subset font files for a given weight. Google Fonts
// splits the font into separate woff2 files by Unicode range (arabic,
// latin, latin-ext) so the browser only fetches what each page needs.
// For server-side OG rendering we need ALL of them — otherwise Satori
// hits a character outside the loaded subset (e.g. the Latin · MIDDLE
// DOT used between footer segments) and tries to download a "dynamic
// font" from Google which returns 400, leaving the glyph broken.
async function loadCairoSubsets(weight: number): Promise<ArrayBuffer[]> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Cairo:wght@${weight}&display=swap`;
  const css = await fetch(cssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  }).then((r) => r.text());
  // Extract every `src: url(...)` in the CSS — one per @font-face block.
  const urls = Array.from(css.matchAll(/src:\s*url\((https?:\/\/[^)]+)\)/g)).map((m) => m[1]);
  if (urls.length === 0) throw new Error('Cairo font URLs not found');
  const buffers = await Promise.all(urls.map((u) => fetch(u).then((r) => r.arrayBuffer())));
  return buffers;
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

  // Load Cairo at two weights, each fanning out to all subsets (arabic,
  // latin, latin-ext) so Satori has glyphs for every character we render
  // — Arabic letters, Latin letters in @theqahapp, and Latin punctuation
  // like · that gets used as a footer separator.
  let cairoRegularBufs: ArrayBuffer[] = [];
  let cairoBoldBufs: ArrayBuffer[] = [];
  try {
    [cairoRegularBufs, cairoBoldBufs] = await Promise.all([
      loadCairoSubsets(600),
      loadCairoSubsets(900),
    ]);
  } catch {
    /* font fetch failed — ImageResponse will fall back to system font */
  }

  // Absolute production URL for the brand logo + the product image
  // passed in via query. Both get pre-fetched server-side and inlined
  // as base64 data URIs so Satori never has to make outbound image
  // requests of its own.
  const brandLogoRemote = `https://www.theqah.com.sa/widgets/logo.png?v=3`;
  const [brandLogo, productImgDataUri] = await Promise.all([
    fetchImageAsDataUri(brandLogoRemote),
    fetchImageAsDataUri(productImg),
  ]);

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

        {/* Header: brand + cert chip.
            Satori doesn't reliably honour `direction: rtl` on nested flex
            containers, so we force the RTL visual via `row-reverse`. JSX
            order remains source-natural (logo block, then cert chip) but
            visually the logo ends up on the right and cert on the left. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
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

        {/* Body: product image + review block side-by-side.
            `direction: rtl` is repeated on every nested flex container so
            children lay out right-to-left as Arabic readers expect. The
            inline `dir="rtl"` HTML attr is for the text-bearing leaf, since
            Satori's bidi algorithm anchors on dir for paragraph-level
            line alignment (right-aligns wrapped lines). */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            gap: '36px',
            alignItems: 'center',
            flex: 1,
          }}
        >
          {productImgDataUri ? (
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productImgDataUri}
                alt=""
                width={300}
                height={300}
                style={{ objectFit: 'contain', maxWidth: '300px', maxHeight: '300px' }}
              />
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end', // Yoga-level right-alignment — pushes
                                       // stars row and text block to the
                                       // column's right edge. textAlign on
                                       // the inner text leaf doesn't take
                                       // effect in Satori, but alignItems
                                       // does because it's a flex layout
                                       // property the layout engine respects.
              flex: 1,
            }}
          >
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
                lineHeight: 1.5,
                color: '#f8fafc',
                textAlign: 'right',
                width: '100%',
                // Satori treats `display: flex` text containers as if each
                // word is a flex item — with `justifyContent: flex-end`
                // that produced massive word-spacing. Plain block layout
                // wraps text naturally and respects textAlign.
                display: 'block',
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
            flexDirection: 'row-reverse',
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
        ...cairoRegularBufs.map((data) => ({
          name: 'Cairo',
          data,
          weight: 600 as const,
          style: 'normal' as const,
        })),
        ...cairoBoldBufs.map((data) => ({
          name: 'Cairo',
          data,
          weight: 900 as const,
          style: 'normal' as const,
        })),
      ],
      // Allow the edge to cache this for 1 hour. Same params = same image.
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}

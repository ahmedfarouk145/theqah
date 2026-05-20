// src/pages/api/og/share-card.tsx
//
// Generates the verified-review share card as a 1080×1080 PNG by
// launching @sparticuz/chromium, navigating to /og/share-card-html
// (an HTML page that renders the card design with full CSS support),
// and screenshotting it. We previously used @vercel/og (Satori) but
// it failed to render Arabic correctly — bidi handling, RTL flex
// alignment, and Arabic word spacing were all incomplete. Real
// Chromium renders Arabic natively because it's, you know, Chrome.
//
// Runtime: Node.js (Chromium can't run on Vercel's Edge runtime).
// Memory: needs ~1024MB; configured below.
//
// Cold start: ~3-5s (Chromium init). Warm: ~500ms-1s (screenshot only).
// The image is cached for 1 hour at the edge, so most hits are free.

import type { NextApiRequest, NextApiResponse } from 'next';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';

// Per-region Function config — Chromium needs more memory than the default.
export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
};

// Cache the browser instance across warm invocations. Vercel's Fluid
// Compute reuses the same Node process for concurrent requests, so a
// persistent browser handle avoids paying the cold-start cost on
// every invocation.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      // Verify the cached browser is still alive.
      if (b.connected) return b;
    } catch {
      /* fall through to fresh launch */
    }
  }
  browserPromise = (async () => {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1080, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  })();
  return browserPromise;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Build the HTML page URL with the same query params we received.
  // The HTML page lives on the same deployment — `req.headers.host`
  // gives us the right origin without requiring an env var.
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host;
  if (!host) {
    res.status(500).json({ error: 'missing host header' });
    return;
  }
  const qs = req.url?.split('?')[1] || '';
  const pageUrl = `${proto}://${host}/og/share-card-html${qs ? '?' + qs : ''}`;

  let browser: Browser | null = null;
  let page = null;
  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.goto(pageUrl, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    });
    // Wait an extra moment for fonts to fully apply — networkidle0
    // covers font file downloads but the rendering may lag one frame.
    await new Promise((r) => setTimeout(r, 200));
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1080 },
      omitBackground: false,
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    );
    // CORS — allow any origin to fetch the image. The widget runs on
    // Salla store domains (not theqah.com.sa) and needs to fetch this
    // image to attach it to navigator.share() on mobile devices. The
    // image is public anyway (no auth), so opening CORS here is safe.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).send(png);
  } catch (err) {
    console.error('[share-card] screenshot failed', err);
    res.status(500).json({
      error: 'screenshot_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    // Close the page to free memory, but keep the browser alive for
    // subsequent warm invocations.
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }
}

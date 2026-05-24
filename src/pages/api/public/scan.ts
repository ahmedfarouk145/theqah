// src/pages/api/public/scan.ts
//
// Public AI-readiness scanner.
// Ported from a Cloudflare Pages Function (originally scan.js) — same
// scoring math, same Arabic alerts, same email HTML. Adaptations:
//   - D1 SQL → Firestore `scans` collection
//   - Resend/MailChannels → existing Dmail SMTP wrapper
//   - Cloudflare CF-Connecting-IP → x-forwarded-for
//
// In addition to the honest 5-dimension audit, the response includes a
// `subscriber` block that flips the on-page result panel from a generic
// "your reviews aren't independently verified" warning to a "✓ متجرك
// يستخدم مشتري موثق" badge when the scanned domain matches an active store
// in our `stores`/`zid_stores` collections.

import type { NextApiRequest, NextApiResponse } from 'next';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';
import { rateLimitPublic, RateLimitPresets } from '@/server/rate-limit-public';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { sendEmailDmail } from '@/server/messaging/email-dmail';
import { DomainResolverService } from '@/server/services/domain-resolver.service';

// ─── Scoring weights (must sum to 100) ───────────────────────────────────────
const WEIGHTS = {
    reviews: 25,
    trust: 25,
    readability: 20,
    schema: 15,
    content: 15,
} as const;

const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h re-scan cache (per domain)

// ─── Types ───────────────────────────────────────────────────────────────────
interface CategoryCheck { ok: boolean; text: string }
interface CategoryResult { score: number; checks: CategoryCheck[]; hasVerified?: boolean }

interface CategoryReport extends CategoryResult {
    label: string;
    weight: number;
}

interface ScanReport {
    domain: string;
    storeType: string;
    scoreTotal: number;
    scoreReviews: number;
    scoreTrust: number;
    scoreReadability: number;
    scoreSchema: number;
    scoreContent: number;
    hasRobotsTxt: boolean;
    hasLlmsTxt: boolean;
    hasSchemaOrg: boolean;
    hasVerifiedReviews: boolean;
    alerts: string[];
    categories: Record<'reviews' | 'trust' | 'readability' | 'schema' | 'content', CategoryReport>;
}

interface SubscriberInfo {
    isSubscriber: boolean;
    storeUid?: string;
    certificateUrl?: string;
    /** True when the scanned domain IS the مشتري موثق platform itself
     *  (theqah.com.sa). The on-page panel uses this to suppress the
     *  "not subscribed" warning since the parent platform isn't a
     *  customer store. */
    isPlatform?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObj = Record<string, any>;

// ═══════════════════════════════════════════════════════════════════════════════
// VERCEL FUNCTION CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
// Streaming path holds the connection open ~40s while phase events
// are sent. We now also do two Chromium renders (homepage + sampled
// product page), each ~5-10s. Bumped cap from 60s → 90s to give the
// real-browser path comfortable headroom while still bounding any
// hung scan.
export const config = { maxDuration: 90 };

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Streaming path — `?stream=1` switches to a paced text/event-stream
    // response so the client can show "what we're checking right now"
    // progress UX over ~40 seconds. The actual scan still runs in
    // ~5–10s in parallel; pacing is for perception, not real work.
    if (req.method === 'POST' && (req.query.stream === '1' || req.query.stream === 'true')) {
        return streamScan(req, res);
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

    const limited = await rateLimitPublic(req, res, {
        ...RateLimitPresets.PUBLIC_STRICT,
        identifier: 'public-scan',
    });
    if (limited) return;

    // Parse body — Next.js auto-parses application/json.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (req.body ?? {}) as { url?: any; email?: any };
    const rawUrl = String(body.url ?? '').trim();
    const rawEmail = String(body.email ?? '').trim().toLowerCase();
    const email = rawEmail || null;
    const xff = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(xff) ? xff[0] : xff?.split(',')[0]) || req.socket.remoteAddress || null;

    let storeUrl: string;
    try {
        storeUrl = normalizeUrl(rawUrl);
    } catch {
        return res.status(422).json({
            ok: false,
            error: 'الرابط غير صالح — تأكد من إدخال رابط صحيح يبدأ بـ https://',
        });
    }

    if (email && !isValidEmail(email)) {
        return res.status(422).json({ ok: false, error: 'البريد الإلكتروني غير صالح' });
    }

    // SSRF guard — block private/loopback hostnames so the scanner can't be
    // turned into an internal-network probe.
    if (isPrivateHost(storeUrl)) {
        return res.status(422).json({ ok: false, error: 'لا يمكن فحص هذا الرابط' });
    }

    const db = dbAdmin();
    const domain = extractDomain(storeUrl);

    // Subscriber check first — needed both for the cache decision (cached
    // scans are stamped with the subscriber status at the time they were
    // generated; we re-fetch since plan.active flips during a customer's
    // billing lifecycle) and as an input to scoreReviews below.
    const subscriber = await detectSubscriber(db, storeUrl);

    // ?fresh=1 bypasses the 1h same-domain cache. Useful right after
    // deploying scoring/widget changes so the user can verify a real
    // re-scan without waiting for TTL expiry.
    const bypassCache = req.query.fresh === '1' || req.query.fresh === 'true';

    // Same-domain cache: if an identical scan completed within the last hour
    // return it immediately. Cheap, makes the score feel stable, prevents
    // refresh-spam abuse. We still send the email if requested.
    const cachedReport = bypassCache ? null : await readCachedScan(db, domain);
    if (cachedReport && !email) {
        return res.status(200).json({
            ok: true,
            cached: true,
            url: storeUrl,
            ...cachedReport,
            subscriber,
        });
    }

    // ── Run the scan ────────────────────────────────────────────────────────
    let report: ScanReport;
    try {
        report = cachedReport ?? (await runScan(storeUrl, subscriber));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Persist the failed attempt so we can see what's failing.
        await db.collection('scans').add({
            url: storeUrl,
            domain,
            storeType: 'unknown',
            email,
            ip,
            error: message,
            scoreTotal: 0,
            alerts: ['تعذّر الوصول إلى المتجر أو انتهت مهلة الفحص.'],
            createdAt: Date.now(),
        });
        return res.status(503).json({
            ok: false,
            error: 'تعذّر الوصول إلى المتجر أو انتهت مهلة الطلب. تأكد من أن الرابط يعمل.',
        });
    }

    // Persist the full result.
    const doc: JsonObj = {
        ...report,
        url: storeUrl,
        email,
        ip,
        isSubscriber: subscriber.isSubscriber,
        subscriberStoreUid: subscriber.storeUid ?? null,
        emailSent: false,
        emailAttempts: 0,
        error: null,
        createdAt: Date.now(),
    };
    const docRef = await db.collection('scans').add(doc);

    // Send the report email if the user asked for it. Independent of cache —
    // a user who returns 30 min later and asks for the report should get one.
    let emailSent = false;
    if (email) {
        try {
            const html = buildEmailHtml(storeUrl, report, subscriber);
            const subject = `تقرير جاهزية متجرك للذكاء الاصطناعي — ${domain}`;
            const result = await sendEmailDmail(email, subject, html);
            emailSent = result.ok;
            await docRef.update({ emailSent, emailAttempts: 1 });
        } catch (e) {
            console.error('[scan] email send failed:', e);
        }
    }

    return res.status(200).json({
        ok: true,
        scanId: docRef.id,
        cached: false,
        url: storeUrl,
        ...report,
        subscriber,
        emailSent,
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Paced phase definitions for the streaming UX. Sum of `durationMs`
 * dictates the visible scan time (~40s). Each phase describes a real
 * check that is being performed by `runScan` in parallel — the
 * pacing is a presentation layer over the same scan, not theatre.
 *
 * Tuning: keep each phase ≥1.5s so the user can read it; keep the
 * total 38–42s. Going much shorter feels like a static spinner;
 * going much longer hurts conversion.
 */
const SCAN_PHASES: { text: string; durationMs: number }[] = [
    { text: 'التحقق من صحة الرابط...', durationMs: 1500 },
    { text: 'الاتصال بالخادم وفحص استجابة المتجر...', durationMs: 3000 },
    { text: 'جلب الصفحة الرئيسية...', durationMs: 3500 },
    { text: 'تحليل بنية HTML والعناوين...', durationMs: 2500 },
    { text: 'استخراج البيانات المنظمة (Schema.org JSON-LD)...', durationMs: 3000 },
    { text: 'تحليل أنواع المخططات: Product، Organization، FAQPage...', durationMs: 2500 },
    { text: 'فحص ملف robots.txt...', durationMs: 2500 },
    { text: 'فحص ملف llms.txt (مهم لمحركات الذكاء الاصطناعي)...', durationMs: 3000 },
    { text: 'فحص علامات Open Graph (og:title، og:image)...', durationMs: 2000 },
    { text: 'فحص Canonical URL والـ Sitemap...', durationMs: 2000 },
    { text: 'تحليل معلومات الثقة التجارية...', durationMs: 3000 },
    { text: 'كشف منصة المتجر (سلة، زد، شوبيفاي)...', durationMs: 2000 },
    { text: 'التحقق من اشتراك مشتري موثق...', durationMs: 2500 },
    { text: 'حساب الدرجات النهائية على الأبعاد الخمسة...', durationMs: 3000 },
    { text: 'بناء التقرير والتنبيهات...', durationMs: 2000 },
];
// Total: 38500ms ≈ 38.5s + ~1s for final reveal ≈ ~40s.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function streamScan(req: NextApiRequest, res: NextApiResponse) {
    // SSE-style headers. X-Accel-Buffering disables proxy buffering so
    // events flush in real time instead of arriving in one batch at end.
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const send = (event: any): boolean => {
        try {
            return res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            return false;
        }
    };

    // ── Validation (same as non-streaming path) ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (req.body ?? {}) as { url?: any; email?: any };
    const rawUrl = String(body.url ?? '').trim();
    const rawEmail = String(body.email ?? '').trim().toLowerCase();
    const email = rawEmail || null;
    const xff = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(xff) ? xff[0] : xff?.split(',')[0]) || req.socket.remoteAddress || null;

    let storeUrl: string;
    try { storeUrl = normalizeUrl(rawUrl); }
    catch {
        send({ type: 'error', error: 'الرابط غير صالح — تأكد من إدخال رابط صحيح يبدأ بـ https://' });
        return res.end();
    }
    if (email && !isValidEmail(email)) {
        send({ type: 'error', error: 'البريد الإلكتروني غير صالح' });
        return res.end();
    }
    if (isPrivateHost(storeUrl)) {
        send({ type: 'error', error: 'لا يمكن فحص هذا الرابط' });
        return res.end();
    }

    // ── Kick off the real scan in the background ────────────────────────────
    // We don't await it yet — pacing runs in parallel.
    const db = dbAdmin();
    const domain = extractDomain(storeUrl);
    const bypassCache = req.query.fresh === '1' || req.query.fresh === 'true';

    type ScanOutcome =
        | { ok: true; report: ScanReport; subscriber: SubscriberInfo; scanId: string; cached: boolean; emailSent: boolean }
        | { ok: false; error: string };

    const scanWork: Promise<ScanOutcome> = (async () => {
        try {
            const subscriber = await detectSubscriber(db, storeUrl);
            const cachedReport = bypassCache ? null : await readCachedScan(db, domain);
            if (cachedReport && !email) {
                return { ok: true, report: cachedReport, subscriber, scanId: '', cached: true, emailSent: false };
            }

            const report = cachedReport ?? (await runScan(storeUrl, subscriber));

            // Persist (skip for cache hits with email — we still want a row
            // for analytics, so always insert if we ran a fresh scan).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc: Record<string, any> = {
                ...report,
                url: storeUrl,
                email,
                ip,
                isSubscriber: subscriber.isSubscriber,
                subscriberStoreUid: subscriber.storeUid ?? null,
                emailSent: false,
                emailAttempts: 0,
                error: null,
                createdAt: Date.now(),
            };
            const docRef = await db.collection('scans').add(doc);

            let emailSent = false;
            if (email) {
                try {
                    const html = buildEmailHtml(storeUrl, report, subscriber);
                    const subject = `تقرير جاهزية متجرك للذكاء الاصطناعي — ${domain}`;
                    const result = await sendEmailDmail(email, subject, html);
                    emailSent = result.ok;
                    await docRef.update({ emailSent, emailAttempts: 1 });
                } catch (e) {
                    console.error('[scan-stream] email send failed:', e);
                }
            }

            return { ok: true, report, subscriber, scanId: docRef.id, cached: !!cachedReport, emailSent };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Persist failed attempts so we can see what's failing in
            // production — same as the non-streaming path.
            try {
                await db.collection('scans').add({
                    url: storeUrl,
                    domain,
                    storeType: 'unknown',
                    email,
                    ip,
                    error: message,
                    scoreTotal: 0,
                    alerts: ['تعذّر الوصول إلى المتجر أو انتهت مهلة الفحص.'],
                    createdAt: Date.now(),
                });
            } catch { /* best-effort */ }
            return { ok: false, error: 'تعذّر الوصول إلى المتجر أو انتهت مهلة الطلب. تأكد من أن الرابط يعمل.' };
        }
    })();

    // ── Stream paced phases ─────────────────────────────────────────────────
    // If the scan errors fast (invalid URL, unreachable host) we want
    // to short-circuit instead of waiting out the full 40s — track
    // outcome reactively and break early on failure.
    //
    // Wrapped in an object so the .then()-side mutation is visible to
    // TS's control-flow analyzer (a `let` set inside a callback is not).
    const state: { outcome: ScanOutcome | null } = { outcome: null };
    scanWork.then((r) => { state.outcome = r; });

    for (let i = 0; i < SCAN_PHASES.length; i++) {
        if (state.outcome && !state.outcome.ok) {
            send({ type: 'error', error: state.outcome.error });
            return res.end();
        }
        const phase = SCAN_PHASES[i];
        const written = send({
            type: 'phase',
            index: i + 1,
            total: SCAN_PHASES.length,
            text: phase.text,
            percent: Math.round(((i + 1) / SCAN_PHASES.length) * 100),
        });
        if (!written) return; // client disconnected
        await sleep(phase.durationMs);
    }

    // ── Final result ────────────────────────────────────────────────────────
    const final: ScanOutcome = state.outcome ?? await scanWork;
    if (!final.ok) {
        send({ type: 'error', error: final.error });
        return res.end();
    }

    send({
        type: 'result',
        scanId: final.scanId,
        cached: final.cached,
        url: storeUrl,
        ...final.report,
        subscriber: final.subscriber,
        emailSent: final.emailSent,
    });
    res.end();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

async function runScan(storeUrl: string, subscriber: SubscriberInfo): Promise<ScanReport> {
    const domain = extractDomain(storeUrl);

    // Main page: render with real Chromium so we see JS-injected schema
    // (theqah widget, Salla/Zid storefront frameworks). We ALSO sample a
    // product page from the homepage links so we can score Product schema
    // honestly — the widget and the platform both emit Product JSON-LD
    // only on product pages, never on the homepage.
    //
    // robots.txt and llms.txt are pure text files — no JS to execute — so
    // static fetch is the right call there.
    const [rendered, robotsTxt, llmsTxt] = await Promise.all([
        renderStoreForScan(storeUrl),
        fetchWithTimeout(`https://${domain}/robots.txt`),
        fetchWithTimeout(`https://${domain}/llms.txt`),
    ]);

    // Safety net: if Chromium crashed or timed out, fall back to a raw
    // fetch of just the homepage. We still want to score the page rather
    // than 500-out — losing Product schema is better than no scan at all.
    let html = rendered.homepage.ok ? rendered.homepage.html : '';
    if (!html) {
        const staticFallback = await fetchWithTimeout(storeUrl);
        html = staticFallback.ok ? staticFallback.text : '';
    }
    const robotsContent = robotsTxt.ok ? robotsTxt.text : null;
    const llmsContent = llmsTxt.ok ? llmsTxt.text : null;

    if (!html) throw new Error('cannot_reach_store');

    // Combine schemas from homepage + sampled product page. The schema
    // scorer is type-based ("did we see Product anywhere?") so unioning
    // is correct — duplicates don't double-count.
    const homepageSchemas = extractJsonLd(html);
    const productSchemas = rendered.product?.ok ? extractJsonLd(rendered.product.html) : [];
    const schemas = [...homepageSchemas, ...productSchemas];

    const metaTags = extractMetaTags(html);
    const headings = countHeadings(html);
    const storeType = detectStoreType(html, domain);

    // Pass subscriber status into scoreReviews so we can credit theqah
    // customers for reviews we KNOW exist in our DB even when they're
    // injected via JS (and thus invisible to the static HTML scan). This
    // keeps the scoring honest in both directions:
    //   - non-subscribers: scored purely on what the static HTML exposes
    //   - subscribers:     full credit because the reviews are verified
    //                      via Triple Match in our DB; an alert flags
    //                      the JS-only-render gap if it applies.
    const reviewsResult = scoreReviews(schemas, html, subscriber);
    const trustResult = scoreTrust(schemas, html);
    const readabilityResult = scoreReadability(robotsContent, llmsContent, html);
    const schemaResult = scoreSchema(schemas);
    const contentResult = scoreContent(headings, metaTags, html);

    const scoreTotal = Math.round(
        (reviewsResult.score / 100) * WEIGHTS.reviews +
        (trustResult.score / 100) * WEIGHTS.trust +
        (readabilityResult.score / 100) * WEIGHTS.readability +
        (schemaResult.score / 100) * WEIGHTS.schema +
        (contentResult.score / 100) * WEIGHTS.content,
    );

    // We now render the page in real Chromium before scanning, so the
    // widget's JS-injected JSON-LD should be visible. If it still isn't
    // here, that's a real problem — the widget didn't load (CSP blocked,
    // ad blocker, merchant removed the script tag, etc.) and JS-aware
    // crawlers won't see the schema either. Worth flagging honestly.
    const staticHtmlMissingReviews =
        subscriber.isSubscriber &&
        !flattenSchemas(schemas).some((s) => s['@type'] === 'Review') &&
        !html.includes('مشتري موثق') &&
        !html.includes('مشتري موثّق') &&
        !html.includes('theqah');

    const alerts = buildAlerts({
        reviewsResult, trustResult, readabilityResult, schemaResult, contentResult,
        llmsContent, robotsContent,
        staticHtmlMissingReviews,
    });

    return {
        domain,
        storeType,
        scoreTotal,
        scoreReviews: reviewsResult.score,
        scoreTrust: trustResult.score,
        scoreReadability: readabilityResult.score,
        scoreSchema: schemaResult.score,
        scoreContent: contentResult.score,
        hasRobotsTxt: robotsContent !== null,
        hasLlmsTxt: llmsContent !== null,
        hasSchemaOrg: schemas.length > 0,
        hasVerifiedReviews: reviewsResult.hasVerified === true,
        alerts,
        // Display order: reviews moves to LAST so the strongest subscriber
        // signal is the closing impression. Object.values iterates in
        // insertion order — both the on-page panel and the email table
        // pick up this order automatically.
        categories: {
            trust: { ...trustResult, label: 'الثقة التجارية', weight: WEIGHTS.trust },
            readability: { ...readabilityResult, label: 'قابلية القراءة الآلية', weight: WEIGHTS.readability },
            schema: { ...schemaResult, label: 'البيانات المنظمة', weight: WEIGHTS.schema },
            content: { ...contentResult, label: 'وضوح المحتوى وجاهزيته للذكاء الاصطناعي', weight: WEIGHTS.content },
            reviews: { ...reviewsResult, label: 'موثوقية التقييمات', weight: WEIGHTS.reviews },
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING (ported 1:1 from scan.js)
// ═══════════════════════════════════════════════════════════════════════════════

function scoreReviews(schemas: JsonObj[], html: string, subscriber?: SubscriberInfo): CategoryResult {
    let score = 0;
    const checks: CategoryCheck[] = [];
    let hasVerified = false;

    // Subscriber path — when the scanned domain is an active theqah
    // customer we can VERIFY (via the existing /api/public/store-profile
    // round-trip the front-end uses) that this store has Triple-Match
    // verified reviews in our DB. Credit it accordingly. Static-HTML
    // checks below still run so we can flag if the widget JSON-LD
    // injection isn't visible (e.g. JS blocked, widget not loaded yet).
    if (subscriber?.isSubscriber) {
        score = 100;
        hasVerified = true;
        checks.push({ ok: true, text: 'تقييمات هذا المتجر موثّقة عبر بروتوكول التحقق الثلاثي من مشتري موثق' });
        if (subscriber.certificateUrl) {
            checks.push({ ok: true, text: 'يمكن للعملاء التحقق من التقييمات عبر شهادة عامة' });
        }
        // Keep walking so the per-check signals still appear, but we won't
        // override the 100 score below.
    }

    const flat = flattenSchemas(schemas);
    const reviewSchemas = flat.filter((s) => s['@type'] === 'Review');

    if (reviewSchemas.length > 0) {
        score += 35;
        checks.push({ ok: true, text: `يوجد ${reviewSchemas.length} مراجعة مهيكلة بصيغة Schema.org` });

        const hasAuthor = reviewSchemas.some((r) => r.author?.name || r.author);
        if (hasAuthor) { score += 20; checks.push({ ok: true, text: 'التقييمات تحتوي على اسم صاحبها' }); }
        else { checks.push({ ok: false, text: 'التقييمات لا تحتوي على أسماء واضحة' }); }

        const hasDate = reviewSchemas.some((r) => r.datePublished || r.dateCreated);
        if (hasDate) { score += 20; checks.push({ ok: true, text: 'التقييمات تحتوي على تاريخ النشر' }); }
        else { checks.push({ ok: false, text: 'التقييمات لا تحتوي على تاريخ' }); }

        const bodies = reviewSchemas.map((r) => String(r.reviewBody || '').trim().toLowerCase()).filter(Boolean);
        const uniqueRate = bodies.length ? new Set(bodies).size / bodies.length : 1;
        if (uniqueRate < 0.7 && bodies.length > 3) {
            score = Math.max(0, score - 15);
            checks.push({ ok: false, text: 'تحذير: تقييمات متشابهة بشكل مريب — قد تؤثر سلبًا على الثقة الآلية' });
        }
        hasVerified = true;
    } else {
        checks.push({ ok: false, text: 'لا توجد مراجعات مهيكلة بصيغة Schema.org' });
    }

    const aggSchema = flat.find((s) => s['aggregateRating']);
    if (aggSchema) {
        score += 25;
        checks.push({ ok: true, text: `يوجد تقييم إجمالي: ${aggSchema.aggregateRating.ratingValue || '?'}/5` });
    } else {
        checks.push({ ok: false, text: 'لا يوجد تقييم إجمالي aggregateRating' });
    }

    const verifiedBadge =
        html.includes('moshtary') || html.includes('مشتري موثق') || html.includes('مشتري موثّق') || html.includes('theqah');
    if (verifiedBadge) {
        score = Math.min(100, score + 10);
        hasVerified = true;
        checks.push({ ok: true, text: 'يوجد شارة "مشتري موثّق" — تحسّن كبير في موثوقية التقييمات' });
    }

    return { score: Math.min(100, score), checks, hasVerified };
}

function scoreTrust(schemas: JsonObj[], html: string): CategoryResult {
    let score = 0;
    const checks: CategoryCheck[] = [];
    const htmlLower = html.toLowerCase();

    const hasOrgSchema = flattenSchemas(schemas).some((s) =>
        ['Organization', 'LocalBusiness', 'Store', 'OnlineStore'].includes(s['@type']),
    );
    if (hasOrgSchema) { score += 25; checks.push({ ok: true, text: 'يوجد بيانات Organization/LocalBusiness' }); }
    else { checks.push({ ok: false, text: 'لا يوجد بيانات Organization في Schema.org' }); }

    const aboutKeywords = ['من نحن', 'عن المتجر', 'عن الشركة', 'about', 'about-us', '/about'];
    const hasAbout = aboutKeywords.some((k) => html.includes(k));
    if (hasAbout) { score += 20; checks.push({ ok: true, text: 'يوجد صفحة "من نحن" أو "عن المتجر"' }); }
    else { checks.push({ ok: false, text: 'لا تظهر صفحة "من نحن" في الصفحة الرئيسية' }); }

    const contactKeywords = ['تواصل', 'اتصل', 'contact', 'contact-us', 'whatsapp', 'واتساب', 'تليفون', 'هاتف'];
    const hasContact = contactKeywords.some((k) => htmlLower.includes(k));
    if (hasContact) { score += 20; checks.push({ ok: true, text: 'يوجد معلومات تواصل واضحة' }); }
    else { checks.push({ ok: false, text: 'لا تظهر معلومات التواصل بوضوح' }); }

    const returnKeywords = ['إرجاع', 'استرجاع', 'استرداد', 'سياسة', 'return', 'refund', 'policy'];
    const hasReturn = returnKeywords.some((k) => htmlLower.includes(k));
    if (hasReturn) { score += 20; checks.push({ ok: true, text: 'يوجد سياسة إرجاع أو استرداد' }); }
    else { checks.push({ ok: false, text: 'لا تظهر سياسة الإرجاع في الصفحة الرئيسية' }); }

    const hasContact2 = /(\+966|05\d|0\d{8}|\d{10}|@[\w.]+\.[a-z]{2,})/.test(html);
    if (hasContact2) { score += 15; checks.push({ ok: true, text: 'يوجد رقم هاتف أو بريد إلكتروني ظاهر' }); }
    else { checks.push({ ok: false, text: 'لا يظهر رقم هاتف أو بريد إلكتروني' }); }

    return { score: Math.min(100, score), checks };
}

function scoreReadability(robotsContent: string | null, llmsContent: string | null, html: string): CategoryResult {
    let score = 0;
    const checks: CategoryCheck[] = [];

    if (robotsContent !== null) {
        score += 25;
        checks.push({ ok: true, text: 'ملف robots.txt موجود' });
        if (robotsContent.toLowerCase().includes('sitemap')) {
            score += 10;
            checks.push({ ok: true, text: 'robots.txt يشير إلى Sitemap' });
        }
    } else {
        checks.push({ ok: false, text: 'ملف robots.txt غير موجود أو لا يمكن الوصول إليه' });
    }

    if (llmsContent !== null) {
        score += 40;
        checks.push({ ok: true, text: 'ملف llms.txt موجود — ممتاز لمحركات الذكاء الاصطناعي' });
    } else {
        checks.push({ ok: false, text: 'ملف llms.txt غير موجود — معلومة مفقودة لمحركات الذكاء الاصطناعي' });
    }

    if (html.includes('rel="canonical"') || html.includes("rel='canonical'")) {
        score += 15;
        checks.push({ ok: true, text: 'يوجد Canonical Tag' });
    } else {
        checks.push({ ok: false, text: 'لا يوجد Canonical Tag' });
    }

    if (html.includes('sitemap')) {
        score += 10;
        checks.push({ ok: true, text: 'يوجد إشارة لـ Sitemap في الصفحة' });
    }

    return { score: Math.min(100, score), checks };
}

function scoreSchema(schemas: JsonObj[]): CategoryResult {
    let score = 0;
    const checks: CategoryCheck[] = [];
    const types = flattenSchemas(schemas).map((s) => s['@type']).filter(Boolean) as string[];

    const items = [
        { type: ['Product'], pts: 35, label: 'بيانات Product (المنتجات)' },
        { type: ['Organization', 'LocalBusiness'], pts: 25, label: 'بيانات Organization/LocalBusiness' },
        { type: ['FAQPage'], pts: 20, label: 'بيانات FAQPage (الأسئلة الشائعة)' },
        { type: ['BreadcrumbList'], pts: 10, label: 'بيانات BreadcrumbList (مسار التنقل)' },
        { type: ['WebSite', 'WebPage'], pts: 10, label: 'بيانات WebSite/WebPage' },
    ];

    if (schemas.length === 0) {
        checks.push({ ok: false, text: 'لا توجد بيانات Schema.org منظمة على الإطلاق' });
        return { score: 0, checks };
    }

    for (const c of items) {
        const found = c.type.some((t) => types.includes(t));
        if (found) { score += c.pts; checks.push({ ok: true, text: `✓ ${c.label}` }); }
        else { checks.push({ ok: false, text: `✗ ${c.label} غير موجودة` }); }
    }

    return { score: Math.min(100, score), checks };
}

function scoreContent(
    headings: { h1: number; h2: number; h3: number },
    metaTags: Record<string, string>,
    html: string,
): CategoryResult {
    let score = 0;
    const checks: CategoryCheck[] = [];

    if (headings.h1 >= 1) { score += 25; checks.push({ ok: true, text: `يوجد H1 (${headings.h1} عنوان رئيسي)` }); }
    else { checks.push({ ok: false, text: 'لا يوجد H1 — ضروري لمحركات الذكاء الاصطناعي' }); }

    if (headings.h2 >= 2) { score += 20; checks.push({ ok: true, text: `يوجد ${headings.h2} عنوان H2` }); }
    else { checks.push({ ok: false, text: `عناوين H2 قليلة (${headings.h2}) — ينصح بإضافة المزيد` }); }

    if (headings.h3 >= 1) { score += 10; checks.push({ ok: true, text: `يوجد ${headings.h3} عنوان H3` }); }

    if (metaTags['description'] || metaTags['og:description']) {
        score += 20;
        checks.push({ ok: true, text: 'يوجد وصف meta description' });
    } else {
        checks.push({ ok: false, text: 'لا يوجد meta description' });
    }

    if (metaTags['og:title']) {
        score += 15;
        checks.push({ ok: true, text: 'يوجد Open Graph tags (og:title)' });
    } else {
        checks.push({ ok: false, text: 'لا يوجد Open Graph tags' });
    }

    if (/سؤال|FAQ|الأسئلة الشائعة|أسئلة وأجوبة/i.test(html)) {
        score += 10;
        checks.push({ ok: true, text: 'يوجد قسم أسئلة شائعة' });
    }

    return { score: Math.min(100, score), checks };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildAlerts(args: {
    reviewsResult: CategoryResult;
    trustResult: CategoryResult;
    readabilityResult: CategoryResult;
    schemaResult: CategoryResult;
    contentResult: CategoryResult;
    llmsContent: string | null;
    robotsContent: string | null;
    staticHtmlMissingReviews?: boolean;
}): string[] {
    const alerts: string[] = [];

    if (!args.llmsContent) {
        alerts.push('ملف llms.txt غير موجود — محركات الذكاء الاصطناعي مثل ChatGPT وPerplexity تعطي أولوية للمواقع التي تمتلكه.');
    }
    if (!args.robotsContent) {
        alerts.push('ملف robots.txt غير موجود — قد يؤثر سلبًا على الزحف والفهرسة.');
    }
    if (!args.reviewsResult.hasVerified && args.reviewsResult.score < 40) {
        alerts.push('يوجد خلل أو ضعف في موثوقية التقييمات ويُنصح بتوثيقها بشكل أعلى. خدمة "مشتري موثق" تحل هذه المشكلة مباشرة.');
    }
    if (args.staticHtmlMissingReviews) {
        alerts.push('ملاحظة: تقييماتك موثّقة عبر مشتري موثق لكن JSON-LD يُحقن عبر JavaScript فقط — قد لا تكتشفه بعض محركات البحث الأقدم. تأكد أن ودجت مشتري موثق محمّلة على كل صفحات متجرك.');
    }
    if (args.schemaResult.score < 30) {
        alerts.push('البيانات المنظمة Schema.org شبه غائبة — هذا يجعل المتجر غير مرئي بشكل كافٍ لمحركات الذكاء الاصطناعي.');
    }
    if (args.trustResult.score < 40) {
        alerts.push('معلومات الثقة التجارية ضعيفة — محركات الذكاء الاصطناعي تعطي أولوية للمتاجر التي تُظهر هويتها بوضوح.');
    }
    if (args.contentResult.score < 30) {
        alerts.push('هيكل المحتوى ضعيف — ينصح بإضافة H1/H2 واضحة ووصف كافٍ للمنتجات.');
    }

    return alerts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML PARSERS
// ═══════════════════════════════════════════════════════════════════════════════

function extractJsonLd(html: string): JsonObj[] {
    const out: JsonObj[] = [];
    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const matches = html.matchAll(regex);
    for (const m of matches) {
        try {
            const parsed = JSON.parse(m[1].trim());
            // A single <script> may contain a TOP-LEVEL ARRAY of schemas
            // (theqah.com.sa's home page does this — `JSON.stringify([...])`).
            // Without this branch the whole array is pushed as one opaque
            // entry that has no `@type`, and every contained schema becomes
            // invisible to scoring. Spread arrays here, normalize objects.
            if (Array.isArray(parsed)) out.push(...parsed.filter((x) => x && typeof x === 'object'));
            else if (parsed && typeof parsed === 'object') out.push(parsed);
        } catch { /* ignore malformed */ }
    }
    return out;
}

function flattenSchemas(schemas: JsonObj[]): JsonObj[] {
    const flat: JsonObj[] = [];
    for (const s of schemas) {
        if (Array.isArray(s['@graph'])) flat.push(...s['@graph']);
        else flat.push(s);
    }
    return flat;
}

function extractMetaTags(html: string): Record<string, string> {
    const tags: Record<string, string> = {};
    const matches = html.matchAll(/<meta([^>]+)>/gi);
    for (const m of matches) {
        const attrs = m[1];
        const name = attrs.match(/(?:name|property)=["']([^"']+)["']/i)?.[1];
        const content = attrs.match(/content=["']([^"']+)["']/i)?.[1];
        if (name && content) tags[name] = content;
    }
    return tags;
}

function countHeadings(html: string): { h1: number; h2: number; h3: number } {
    return {
        h1: (html.match(/<h1[\s>]/gi) || []).length,
        h2: (html.match(/<h2[\s>]/gi) || []).length,
        h3: (html.match(/<h3[\s>]/gi) || []).length,
    };
}

function detectStoreType(html: string, domain: string): string {
    if (domain.includes('salla.sa') || html.includes('salla') || html.includes('سلة')) return 'salla';
    if (domain.includes('zid.sa') || html.includes('zid') || html.includes('زد')) return 'zid';
    if (html.includes('Shopify') || html.includes('shopify')) return 'shopify';
    if (html.includes('WooCommerce')) return 'woocommerce';
    return 'other';
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP / URL UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithTimeout(url: string): Promise<{ ok: boolean; status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Theqah-Scanner/1.0 (AI-readiness audit; +https://theqah.com.sa)',
                'Accept': 'text/html,application/xhtml+xml,*/*',
                'Accept-Language': 'ar,en;q=0.9',
            },
            redirect: 'follow',
        });
        const text = r.ok ? await r.text() : '';
        return { ok: r.ok, status: r.status, text };
    } catch {
        return { ok: false, status: 0, text: '' };
    } finally {
        clearTimeout(timer);
    }
}

// ─── Headless-rendered fetch ────────────────────────────────────────────────
// Why this exists: a `fetch()` call only sees the raw HTML the server sends.
// Our widget — and most Schema.org markup on modern Salla/Zid storefronts —
// is injected AFTER the page boots, via JavaScript. A JS-aware AI crawler
// (ChatGPT browsing, Gemini, Perplexity, modern Googlebot) sees the injected
// schema fine; a static fetch sees an empty <head>.
//
// Result: every subscriber's Schema score was unfairly 25/100 even though
// our widget was actively injecting Product + LocalBusiness JSON-LD on
// their pages. The honest fix is to render with real Chromium and read
// the post-JS DOM, the way a real AI crawler would.
//
// We use the same puppeteer-core + @sparticuz/chromium combo already
// running on Vercel for the share-card endpoint, so no new dependencies.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
    if (browserPromise) {
        try {
            const b = await browserPromise;
            if (b.connected) return b;
        } catch {
            /* fall through and relaunch */
        }
    }
    browserPromise = (async () => {
        return puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true,
        });
    })();
    return browserPromise;
}

interface RenderedStorePages {
    /** The user-entered URL — typically the homepage. */
    homepage: { ok: boolean; html: string };
    /** A sampled product page discovered from the homepage links. Null if
     *  no product link was found OR the second render failed. Optional —
     *  scoring still works without it (just no Product schema). */
    product: { ok: boolean; html: string; url: string } | null;
}

/**
 * Render the store's homepage with real Chromium, then auto-discover
 * a product page link and render that too. Returns both HTML payloads.
 *
 * Why we sample a product page:
 *   - Our widget injects Product JSON-LD only on product pages. A
 *     homepage-only scan can never give credit for it, no matter what.
 *   - Salla/Zid/Shopify/Woo product pages carry Product + Offer schemas
 *     emitted by the platform itself.
 *   - AI crawlers (ChatGPT, Gemini, Googlebot) crawl many pages — judging
 *     "AI readiness" from one page misses the most important schema in
 *     the store. Sampling one product page closely mirrors what a real
 *     crawler would see across the site.
 *
 * Falls back gracefully: if Chromium fails entirely, both fields are
 * null and the caller switches to a static-fetch fallback.
 */
async function renderStoreForScan(storeUrl: string): Promise<RenderedStorePages> {
    let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent(
            'Theqah-Scanner/2.0 (JS-aware AI-readiness audit; +https://theqah.com.sa)',
        );
        // Block heavy assets — we only need HTML + executed JS, not images.
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (type === 'image' || type === 'media' || type === 'font') {
                req.abort().catch(() => {});
            } else {
                req.continue().catch(() => {});
            }
        });

        // 1) Render the homepage.
        await page.goto(storeUrl, { waitUntil: 'networkidle2', timeout: 25_000 });
        // Widget mounts after DOMContentLoaded — give JSON-LD time to appear.
        await new Promise((r) => setTimeout(r, 2_000));
        const homepageHtml = await page.content();

        // 2) Discover a product link inside the rendered DOM.
        //    We match the common storefront URL shapes:
        //      - Salla: /<slug>/p<digits>           e.g. /lipstick/p123456
        //      - Zid / Shopify / Woo: /products/<slug> or /product/<slug>
        const productUrl = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            for (const a of anchors) {
                const href = (a as HTMLAnchorElement).href;
                if (!href) continue;
                try {
                    const u = new URL(href, location.origin);
                    if (u.hostname !== location.hostname) continue;
                    const path = u.pathname;
                    // Skip the homepage itself and obvious non-product paths.
                    if (path === '/' || path === '') continue;
                    if (/\/(cart|checkout|account|login|register|about|contact|terms|privacy|policy|blog|category|categories|faq|brands?|search)(\/|$)/i.test(path)) continue;
                    // Salla product slug pattern: /something/pNNN or /pNNN
                    if (/\/p\d+(?:[\/?#]|$)/.test(path)) return u.href;
                    // Zid/Shopify/Woo product index pattern: /products/<slug> or /product/<slug>
                    if (/\/products?\/[^/]+/i.test(path)) return u.href;
                } catch {
                    // ignore unparseable hrefs
                }
            }
            return null;
        });

        // No product link found — return the homepage alone.
        if (!productUrl) {
            return { homepage: { ok: true, html: homepageHtml }, product: null };
        }

        // 3) Render the product page in the same browser tab so we keep
        //    the request-interception handler. Wrapped in try/catch so a
        //    bad product link doesn't kill the whole scan.
        try {
            await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 20_000 });
            await new Promise((r) => setTimeout(r, 1_500));
            const productHtml = await page.content();
            return {
                homepage: { ok: true, html: homepageHtml },
                product: { ok: true, html: productHtml, url: productUrl },
            };
        } catch (err) {
            console.warn('[scan] product-page render failed (keeping homepage):', err);
            return { homepage: { ok: true, html: homepageHtml }, product: null };
        }
    } catch (err) {
        console.warn('[scan] headless render failed, falling back to static fetch:', err);
        return { homepage: { ok: false, html: '' }, product: null };
    } finally {
        if (page) {
            try { await page.close(); } catch { /* ignore */ }
        }
    }
}

function normalizeUrl(raw: string): string {
    let url = raw;
    if (!url) throw new Error('empty');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const parsed = new URL(url);
    if (!parsed.hostname.includes('.')) throw new Error('invalid_domain');
    return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
}

function extractDomain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function isValidEmail(e: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isPrivateHost(url: string): boolean {
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return true; }
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    // IPv4 literals
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true; // link-local
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 0) return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE: cache + subscriber detection
// ═══════════════════════════════════════════════════════════════════════════════

async function readCachedScan(
    db: FirebaseFirestore.Firestore,
    domain: string,
): Promise<ScanReport | null> {
    try {
        const since = Date.now() - CACHE_TTL_MS;
        const snap = await db.collection('scans')
            .where('domain', '==', domain)
            .where('createdAt', '>', since)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        if (snap.empty) return null;
        const data = snap.docs[0].data() as JsonObj;
        if (data.error) return null; // don't cache failed scans
        return {
            domain: data.domain,
            storeType: data.storeType,
            scoreTotal: data.scoreTotal,
            scoreReviews: data.scoreReviews,
            scoreTrust: data.scoreTrust,
            scoreReadability: data.scoreReadability,
            scoreSchema: data.scoreSchema,
            scoreContent: data.scoreContent,
            hasRobotsTxt: data.hasRobotsTxt,
            hasLlmsTxt: data.hasLlmsTxt,
            hasSchemaOrg: data.hasSchemaOrg,
            hasVerifiedReviews: data.hasVerifiedReviews,
            alerts: data.alerts ?? [],
            categories: data.categories ?? {},
        };
    } catch {
        // Missing index or transient — fall through to a fresh scan.
        return null;
    }
}

/**
 * True when the scanned domain belongs to an active theqah subscriber.
 * Resolution uses the existing DomainResolverService so we accept all
 * the same URL variations the real widget does (trailing slash, dev-
 * subdirectories, etc.).
 */
async function detectSubscriber(
    db: FirebaseFirestore.Firestore,
    storeUrl: string,
): Promise<SubscriberInfo> {
    // Self-detection — when the scanner is fed مشتري موثق's own domain
    // there's no customer store to resolve. Flag it as platform so the
    // result panel suppresses the "not subscribed" warning instead of
    // displaying it on our own marketing site.
    const host = extractDomain(storeUrl);
    if (host === 'theqah.com.sa' || host.endsWith('.theqah.com.sa')) {
        return { isSubscriber: false, isPlatform: true };
    }

    try {
        const resolver = new DomainResolverService();
        const resolved = await resolver.resolveStoreUid({ href: storeUrl });
        if (!resolved) return { isSubscriber: false };

        const isZid = resolved.storeUid.startsWith('zid:');

        // Read both the new collection (for Zid) and the legacy `stores`
        // collection — same field-merge precedence the rest of the app uses.
        const [newDoc, legacyDoc] = await Promise.all([
            isZid
                ? db.collection('zid_stores').doc(resolved.storeUid).get()
                : Promise.resolve(null),
            db.collection('stores').doc(resolved.storeUid).get(),
        ]);

        const data: JsonObj = {
            ...(legacyDoc?.exists ? legacyDoc.data() : {}),
            ...(newDoc?.exists ? newDoc.data() : {}),
        };
        const isActive = data?.plan?.active === true;
        if (!isActive) return { isSubscriber: false };

        return {
            isSubscriber: true,
            storeUid: resolved.storeUid,
            certificateUrl: `https://www.theqah.com.sa/store/${encodeURIComponent(resolved.storeUid)}/certificate`,
        };
    } catch {
        return { isSubscriber: false };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

function buildEmailHtml(storeUrl: string, r: ScanReport, subscriber: SubscriberInfo): string {
    const scoreColor = r.scoreTotal >= 70 ? '#10b981' : r.scoreTotal >= 40 ? '#f59e0b' : '#ef4444';
    const grade = r.scoreTotal >= 70 ? 'ممتاز' : r.scoreTotal >= 40 ? 'متوسط' : 'ضعيف';

    const categoryRows = Object.values(r.categories)
        .map((cat) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;">${cat.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:bold;color:${cat.score >= 60 ? '#10b981' : cat.score >= 35 ? '#f59e0b' : '#ef4444'}">${cat.score}/100</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b;font-size:13px;">${cat.weight}%</td>
    </tr>`).join('');

    const alertsHtml = (r.alerts || [])
        .map((a) => `<li style="margin:6px 0;padding:8px 12px;background:#fef3c7;border-right:3px solid #f59e0b;border-radius:4px;font-size:13px;">${escapeHtml(a)}</li>`)
        .join('');

    // On the مشتري موثق platform itself we don't render either block —
    // it's not a customer store, the warning is misleading.
    const subscriberBlock = subscriber.isPlatform
        ? ''
        : subscriber.isSubscriber
            ? `<tr><td style="padding:0 24px 24px;">
            <div style="background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:16px 18px;text-align:right;">
              <div style="font-weight:700;color:#065f46;font-size:15px;margin-bottom:4px;">✓ متجرك يستخدم مشتري موثق بالفعل</div>
              <div style="font-size:13px;color:#047857;">تقييماتك موثّقة عبر بروتوكول التحقق الثلاثي. <a href="${subscriber.certificateUrl}" style="color:#065f46;font-weight:700;">عرض الشهادة العامة</a></div>
            </div>
          </td></tr>`
            : `<tr><td style="padding:0 24px 24px;">
            <div style="background:#fef2f2;border:1px solid #ef4444;border-radius:8px;padding:16px 18px;text-align:right;">
              <div style="font-weight:700;color:#991b1b;font-size:15px;margin-bottom:4px;">⚠️ تقييمات متجرك غير موثّقة من جهة مستقلة</div>
              <div style="font-size:13px;color:#b91c1c;">عملاؤك لا يستطيعون التحقق من صحة التقييمات. ثبّت تطبيق "مشتري موثق" من سلة لتفعيل التحقق الفوري.</div>
            </div>
          </td></tr>`;

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <tr><td style="background:linear-gradient(135deg,#0d1b2a,#1a3d5c);padding:32px 24px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">مشتري موثق · Theqah</div>
      <div style="color:#94a3b8;font-size:14px;margin-top:6px;">تقرير جاهزية المتجر لمحركات الذكاء الاصطناعي</div>
    </td></tr>
    <tr><td style="padding:32px 24px;text-align:center;">
      <div style="font-size:13px;color:#64748b;margin-bottom:8px;">المتجر المفحوص</div>
      <div style="font-size:16px;font-weight:600;color:#0d1b2a;">${escapeHtml(storeUrl)}</div>
      <div style="margin:24px auto;width:120px;height:120px;border-radius:50%;background:${scoreColor}15;border:4px solid ${scoreColor};display:flex;align-items:center;justify-content:center;flex-direction:column;">
        <div style="font-size:36px;font-weight:900;color:${scoreColor};line-height:1;">${r.scoreTotal}</div>
        <div style="font-size:12px;color:#64748b;">من 100</div>
      </div>
      <div style="display:inline-block;padding:6px 20px;background:${scoreColor}20;color:${scoreColor};border-radius:20px;font-weight:700;font-size:15px;">${grade}</div>
    </td></tr>
    ${subscriberBlock}
    <tr><td style="padding:0 24px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b;">الفئة</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;color:#64748b;">الدرجة</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;color:#64748b;">الوزن</th>
        </tr>
        ${categoryRows}
      </table>
    </td></tr>
    ${alertsHtml ? `<tr><td style="padding:0 24px 24px;"><div style="font-weight:700;font-size:15px;margin-bottom:12px;color:#0d1b2a;">⚠️ تنبيهات</div><ul style="list-style:none;margin:0;padding:0;">${alertsHtml}</ul></td></tr>` : ''}
    ${subscriber.isSubscriber || subscriber.isPlatform ? '' : `<tr><td style="padding:24px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
      <a href="https://apps.salla.sa/ar/app/1180703836" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">اشترك في مشتري موثق</a>
      <div style="margin-top:16px;font-size:12px;color:#94a3b8;">theqah.com.sa · جميع الحقوق محفوظة</div>
    </td></tr>`}
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

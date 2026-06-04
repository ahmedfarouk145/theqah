// src/components/ScannerSection.tsx
//
// Public AI-readiness scanner section for the home page.
// Posts to /api/public/scan and renders an honest 5-dimension report.
// When the scanned domain IS an active subscriber, the panel shows a positive
// "متجرك يستخدم مشتري موثق" badge + link to the public certificate. Non-subscribers
// see no red banner; instead the reviews-trust alert links the "مشتري موثق"
// service name (in blue) to the Salla install page.

'use client';

import { useState, FormEvent, useRef, useEffect, ReactNode } from 'react';

interface CategoryReport {
    label: string;
    score: number;
    weight: number;
    checks: { ok: boolean; text: string }[];
}

interface SubscriberInfo {
    isSubscriber: boolean;
    storeUid?: string;
    certificateUrl?: string;
    isPlatform?: boolean;
}

interface ScanResponse {
    ok: boolean;
    error?: string;
    scanId?: string;
    cached?: boolean;
    url?: string;
    domain?: string;
    storeType?: string;
    scoreTotal?: number;
    alerts?: string[];
    categories?: Record<string, CategoryReport>;
    subscriber?: SubscriberInfo;
    emailSent?: boolean;
}

const SALLA_INSTALL_URL = 'https://apps.salla.sa/ar/app/1180703836';

// Render an alert string, turning the "مشتري موثق" service name into a blue
// link to the Salla install page — but only inside the reviews-trust alert
// that proposes the service as the solution.
function renderAlert(text: string): ReactNode {
    const TOKEN = 'مشتري موثق';
    if (text.includes('تحل هذه المشكلة')) {
        const idx = text.indexOf(TOKEN);
        if (idx !== -1) {
            return (
                <>
                    {text.slice(0, idx)}
                    <a
                        href={SALLA_INSTALL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 font-bold underline"
                    >
                        {TOKEN}
                    </a>
                    {text.slice(idx + TOKEN.length)}
                </>
            );
        }
    }
    return text;
}

function gradeFor(score: number): { label: string; color: string; bg: string } {
    if (score >= 70) return { label: 'ممتاز', color: '#047857', bg: '#ecfdf5' };
    if (score >= 40) return { label: 'متوسط', color: '#b45309', bg: '#fffbeb' };
    return { label: 'ضعيف', color: '#b91c1c', bg: '#fef2f2' };
}

interface PhaseEvent {
    index: number;
    total: number;
    text: string;
    percent: number;
}

// Tooltip explainers for each category. Mapped by label so we don't
// have to know the API key ('reviews', 'trust', etc.) on the client.
const CATEGORY_EXPLAINERS: Record<string, string> = {
    'موثوقية التقييمات':
        'وجود تقييمات Schema.org بصيغة منظمة، أسماء المُقيّمين، تواريخ النشر، التقييم الإجمالي (aggregateRating)، وشارة "مشتري موثق".',
    'الثقة التجارية':
        'بيانات Organization في Schema.org، صفحة "من نحن"، معلومات تواصل واضحة، سياسة إرجاع.',
    'قابلية القراءة الآلية':
        'وجود ملفي robots.txt و llms.txt، Canonical Tag، و Sitemap. ملف llms.txt مهم بشكل خاص لمحركات الذكاء الاصطناعي.',
    'البيانات المنظمة':
        'بيانات Schema.org من نوع Product و Organization و FAQPage و BreadcrumbList و WebSite.',
    'وضوح المحتوى وجاهزيته للذكاء الاصطناعي':
        'ترتيب العناوين (H1، H2، H3)، meta description، Open Graph tags، ووجود قسم أسئلة شائعة.',
};

// Animated number counter — eases from 0 to `target` over `durationMs`
// using requestAnimationFrame. Used for the big score reveal.
function useAnimatedNumber(target: number, durationMs: number = 1200): number {
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (!target) {
            setValue(0);
            return;
        }
        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const p = Math.min((now - start) / durationMs, 1);
            // ease-out-cubic — fast at start, settles at the end
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(target * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, durationMs]);
    return value;
}

export default function ScannerSection() {
    const [url, setUrl] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [phase, setPhase] = useState<PhaseEvent | null>(null);
    const [completedPhases, setCompletedPhases] = useState<string[]>([]);
    const [result, setResult] = useState<ScanResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const resultRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll to result when it lands so the user never wonders
    // "did anything happen?" — happens once, on the transition from
    // null to a populated result.
    useEffect(() => {
        if (result && resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [result]);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setResult(null);
        setPhase(null);
        setCompletedPhases([]);
        setLoading(true);

        try {
            // Streaming mode: server sends paced "phase" events for ~40s
            // while running the real scan in parallel, then a final
            // "result" or "error" event. We consume the stream with a
            // ReadableStream reader and parse the SSE-style frames.
            const res = await fetch('/api/public/scan?stream=1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), email: email.trim() || undefined }),
            });
            if (!res.ok || !res.body) {
                const fallback = await res.json().catch(() => null);
                setError(fallback?.error || 'حدث خطأ أثناء الفحص. حاول مرة أخرى.');
                setLoading(false);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const seenTexts: string[] = [];

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Each SSE frame ends with a blank line (\n\n).
                const frames = buffer.split('\n\n');
                buffer = frames.pop() ?? '';
                for (const frame of frames) {
                    const line = frame.trim();
                    if (!line.startsWith('data: ')) continue;
                    const json = line.slice(6);
                    let evt: { type: string; [k: string]: unknown };
                    try { evt = JSON.parse(json); } catch { continue; }

                    if (evt.type === 'phase') {
                        const p = evt as unknown as PhaseEvent & { type: string };
                        // Promote previous phase to completed list.
                        if (p.index > 1 && seenTexts[p.index - 2]) {
                            setCompletedPhases((prev) => [...prev, seenTexts[p.index - 2]!]);
                        }
                        seenTexts[p.index - 1] = p.text;
                        setPhase({ index: p.index, total: p.total, text: p.text, percent: p.percent });
                    } else if (evt.type === 'result') {
                        setResult(evt as unknown as ScanResponse);
                        // Mark final phase complete.
                        if (seenTexts.length > 0) {
                            setCompletedPhases((prev) => [...prev, seenTexts[seenTexts.length - 1]!]);
                        }
                    } else if (evt.type === 'error') {
                        setError(String(evt.error || 'حدث خطأ أثناء الفحص.'));
                    }
                }
            }
        } catch {
            setError('تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.');
        } finally {
            setLoading(false);
            setPhase(null);
        }
    }

    const score = result?.scoreTotal ?? 0;
    const grade = gradeFor(score);
    // Animated counter — eases from 0 to the final score over ~1.2s
    // when the result first lands. Re-runs if the result changes.
    const animatedScore = useAnimatedNumber(score);

    return (
        <section
            id="scanner"
            dir="rtl"
            className="bg-gradient-to-b from-slate-50 to-white py-16 px-4 border-t border-slate-200"
        >
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-4 border border-emerald-200">
                        ⚡ أداة مجانية
                    </div>
                    {/* H1 — primary heading for the /scanner page. */}
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-3 leading-tight">
                        هل ستجدك محركات الذكاء الاصطناعي؟
                    </h1>
                    <p className="text-slate-600 text-base md:text-lg max-w-xl mx-auto">
                        أدخل رابط متجرك وسنفحص مدى جاهزيته للظهور في ChatGPT و Perplexity و Google AI Overviews.
                    </p>
                </div>

                {/* Form */}
                <form
                    onSubmit={onSubmit}
                    className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 space-y-4"
                >
                    <div>
                        <label htmlFor="scanner-url" className="block text-sm font-bold text-slate-700 mb-2">
                            رابط المتجر
                        </label>
                        <input
                            id="scanner-url"
                            type="text"
                            inputMode="url"
                            autoComplete="off"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required
                            disabled={loading}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
                        />
                    </div>

                    <div>
                        <label htmlFor="scanner-email" className="block text-sm font-bold text-slate-700 mb-2">
                            البريد الإلكتروني <span className="text-slate-400 font-normal">(اختياري — لإرسال نسخة من التقرير)</span>
                        </label>
                        <input
                            id="scanner-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="email@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !url.trim()}
                        className="w-full py-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-base transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                جاري الفحص…
                            </>
                        ) : (
                            <>← بدء الفحص</>
                        )}
                    </button>

                    {/* "Estimated time" hint shown before scan starts so
                        the 40-second wait is opted into knowingly. */}
                    {!loading && !result && !error && (
                        <p className="text-xs text-slate-500 text-center">
                            الفحص يستغرق حوالي ٤٠ ثانية — نفحص متجرك على ١٥ نقطة.
                        </p>
                    )}

                    {error && (
                        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 text-right">
                            {error}
                        </div>
                    )}
                </form>

                {/* Live progress panel — visible only while scanning.
                    Shows current phase prominently + a progress bar +
                    a fading list of completed phases for context. */}
                {loading && phase && (
                    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                        <div className="flex items-center justify-between mb-4 text-xs text-slate-500">
                            <span>الخطوة {phase.index} من {phase.total}</span>
                            <span className="font-bold text-emerald-700">{phase.percent}٪</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-5">
                            <div
                                className="h-full bg-gradient-to-l from-emerald-500 to-emerald-600 transition-all duration-500 ease-out"
                                style={{ width: `${phase.percent}%` }}
                            />
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="inline-block mt-1 w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-600 rounded-full animate-spin shrink-0" />
                            <div className="flex-1 text-right">
                                <div className="font-bold text-slate-900 text-base leading-relaxed">{phase.text}</div>
                            </div>
                        </div>

                        {/* Completed steps — last 4, faded. Gives the user
                            evidence the scan is doing real work without
                            overwhelming the panel. */}
                        {completedPhases.length > 0 && (
                            <ul className="mt-5 space-y-1.5">
                                {completedPhases.slice(-4).map((t, i) => (
                                    <li
                                        key={`${t}-${i}`}
                                        className="text-xs text-slate-400 flex items-center gap-2 text-right"
                                    >
                                        <span className="text-emerald-500">✓</span>
                                        <span className="truncate">{t}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Result panel */}
                <div ref={resultRef} />
                {result && result.scoreTotal !== undefined && (
                    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                        {/* Domain + score */}
                        <div className="text-center pb-6 border-b border-slate-100">
                            <div className="text-xs text-slate-500 mb-1">المتجر المفحوص</div>
                            <div className="font-mono text-slate-900 text-sm break-all mb-4">{result.url}</div>
                            <div
                                className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 mb-3"
                                style={{ borderColor: grade.color, background: grade.bg }}
                            >
                                <div className="text-center">
                                    <div className="text-4xl font-black" style={{ color: grade.color }}>
                                        {animatedScore}
                                    </div>
                                    <div className="text-xs text-slate-500">من 100</div>
                                </div>
                            </div>
                            <div
                                className="inline-block px-4 py-1.5 rounded-full text-sm font-bold"
                                style={{ background: grade.bg, color: grade.color }}
                            >
                                {grade.label}
                            </div>
                        </div>

                        {/* Subscriber badge / warning — suppressed on the
                            مشتري موثق platform itself (theqah.com.sa) since
                            the parent platform isn't a customer store. */}
                        {result.subscriber?.isPlatform ? null : result.subscriber?.isSubscriber ? (
                            <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-300 p-4">
                                <div className="font-bold text-emerald-800 mb-1">✓ متجرك يستخدم مشتري موثق بالفعل</div>
                                <div className="text-sm text-emerald-700">
                                    تقييماتك موثّقة عبر بروتوكول التحقق الثلاثي.{' '}
                                    {result.subscriber.certificateUrl && (
                                        <a
                                            href={result.subscriber.certificateUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-bold underline"
                                        >
                                            عرض الشهادة العامة →
                                        </a>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {/* Category breakdown — each row has:
                            - Label + weight + tooltip (?)
                            - Score number (color-graded)
                            - Horizontal progress bar (0-100% fill)
                            The native <details> for tooltips works
                            without JS and is keyboard-accessible. */}
                        {result.categories && (
                            <div className="mt-6">
                                <div className="font-bold text-slate-900 text-sm mb-3">تفاصيل التقييم</div>
                                <div className="space-y-3">
                                    {Object.values(result.categories).map((cat) => {
                                        const catGrade = gradeFor(cat.score);
                                        const explainer = CATEGORY_EXPLAINERS[cat.label];
                                        return (
                                            <div
                                                key={cat.label}
                                                className="p-4 rounded-lg bg-slate-50 border border-slate-100"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex-1 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {explainer && (
                                                                <details className="group inline-block relative">
                                                                    <summary className="list-none cursor-pointer text-slate-400 hover:text-emerald-600 text-xs select-none">
                                                                        ⓘ
                                                                    </summary>
                                                                    <div className="absolute z-10 right-0 top-5 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-lg leading-relaxed text-right">
                                                                        {explainer}
                                                                    </div>
                                                                </details>
                                                            )}
                                                            <span className="font-bold text-sm text-slate-900">
                                                                {cat.label}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-slate-500 mt-0.5">
                                                            الوزن: {cat.weight}%
                                                        </div>
                                                    </div>
                                                    <div className="font-black text-lg" style={{ color: catGrade.color }}>
                                                        {cat.score}/100
                                                    </div>
                                                </div>
                                                {/* Progress bar — fills to cat.score% with the
                                                    same color the score number uses. */}
                                                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full transition-all duration-1000 ease-out"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, cat.score))}%`,
                                                            background: catGrade.color,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Alerts */}
                        {result.alerts && result.alerts.length > 0 && (
                            <div className="mt-6">
                                <div className="font-bold text-slate-900 text-sm mb-3">⚠️ تنبيهات</div>
                                <ul className="space-y-2">
                                    {result.alerts.map((a, i) => (
                                        <li
                                            key={i}
                                            className="px-3 py-2.5 rounded-lg bg-amber-50 border-r-4 border-amber-400 text-amber-900 text-sm"
                                        >
                                            {renderAlert(a)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Email confirmation */}
                        {result.emailSent && (
                            <div className="mt-6 text-center text-sm text-emerald-700">
                                ✓ تم إرسال نسخة من التقرير إلى بريدك الإلكتروني.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

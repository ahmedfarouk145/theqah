// src/components/ScannerSection.tsx
//
// Public AI-readiness scanner section for the home page.
// Posts to /api/public/scan and renders an honest 5-dimension report.
// When the scanned domain isn't an active theqah subscriber, the result
// panel surfaces a prominent "reviews not independently verified" warning
// + Salla install CTA. When it IS an active subscriber, the panel shows
// a positive "متجرك يستخدم مشتري موثق" badge + link to the public certificate.

'use client';

import { useState, FormEvent } from 'react';

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

function gradeFor(score: number): { label: string; color: string; bg: string } {
    if (score >= 70) return { label: 'ممتاز', color: '#047857', bg: '#ecfdf5' };
    if (score >= 40) return { label: 'متوسط', color: '#b45309', bg: '#fffbeb' };
    return { label: 'ضعيف', color: '#b91c1c', bg: '#fef2f2' };
}

export default function ScannerSection() {
    const [url, setUrl] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ScanResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setResult(null);
        setLoading(true);
        try {
            const res = await fetch('/api/public/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), email: email.trim() || undefined }),
            });
            const data: ScanResponse = await res.json();
            if (!res.ok || !data.ok) {
                setError(data.error || 'حدث خطأ أثناء الفحص. حاول مرة أخرى.');
                setResult(null);
            } else {
                setResult(data);
            }
        } catch {
            setError('تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.');
        } finally {
            setLoading(false);
        }
    }

    const score = result?.scoreTotal ?? 0;
    const grade = gradeFor(score);

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
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-3 leading-tight">
                        هل ستجدك محركات الذكاء الاصطناعي؟
                    </h2>
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

                    {error && (
                        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 text-right">
                            {error}
                        </div>
                    )}
                </form>

                {/* Result panel */}
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
                                        {result.scoreTotal}
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
                        ) : (
                            <div className="mt-6 rounded-xl bg-red-50 border border-red-300 p-4">
                                <div className="font-bold text-red-800 mb-1">⚠️ تقييمات متجرك غير موثّقة من جهة مستقلة</div>
                                <div className="text-sm text-red-700 mb-3">
                                    عملاؤك لا يستطيعون التحقق من صحة التقييمات. ثبّت تطبيق &quot;مشتري موثق&quot; لتفعيل التحقق الفوري.
                                </div>
                                <a
                                    href={SALLA_INSTALL_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors"
                                >
                                    ثبّت &quot;مشتري موثق&quot; على سلة ←
                                </a>
                            </div>
                        )}

                        {/* Category breakdown */}
                        {result.categories && (
                            <div className="mt-6">
                                <div className="font-bold text-slate-900 text-sm mb-3">تفاصيل التقييم</div>
                                <div className="space-y-2">
                                    {Object.values(result.categories).map((cat) => {
                                        const catGrade = gradeFor(cat.score);
                                        return (
                                            <div key={cat.label} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                                                <div className="flex-1 text-right">
                                                    <div className="font-bold text-sm text-slate-900">{cat.label}</div>
                                                    <div className="text-xs text-slate-500">الوزن: {cat.weight}%</div>
                                                </div>
                                                <div className="font-black text-lg" style={{ color: catGrade.color }}>
                                                    {cat.score}/100
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
                                            {a}
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

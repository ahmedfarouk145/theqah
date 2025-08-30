// src/pages/review/[token].tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import UploadcareWidget from "@/components/UploadcareWidget";

type UploadedFile = { cdnUrl: string; name?: string; size?: number; mime?: string };

type TokenInfo = {
  tokenId: string;
  orderId?: string;
  storeName?: string;
  customerName?: string;
  expired?: boolean;
  voided?: boolean;
};

type SubmitBody = {
  orderId: string;
  stars: number;
  text?: string;
  images?: string[];
  tokenId?: string;
  platform?: "salla" | "zid" | "manual";
};

export default function ReviewByTokenPage() {
  const router = useRouter();
  const { token } = router.query as { token?: string };

  const [stars, setStars] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { id?: string }>(null);
  const [error, setError] = useState<string | null>(null);

  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

  // جلب معلومات التوكن إن كانت API متاحة (نتجاهل لو مش موجودة)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      setLoadingToken(true);
      setError(null);
      try {
        // حاول API قياسي بسيط: /api/review-token?token=<id>
        const r = await fetch(`/api/review-token?token=${encodeURIComponent(token)}`);
        if (!r.ok) {
          // مش مشكلة لو 404 — هنكمل بالـ token كـ orderId fallback
          setTokenInfo({ tokenId: token });
          return;
        }
        const j = await r.json();
        if (!cancelled) {
          const info: TokenInfo = {
            tokenId: token,
            orderId: j?.orderId || undefined,
            storeName: j?.storeName || undefined,
            customerName: j?.customer?.name || undefined,
            expired: Boolean(j?.expired),
            voided: Boolean(j?.voided),
          };
          setTokenInfo(info);
        }
      } catch {
        if (!cancelled) setTokenInfo({ tokenId: token });
      } finally {
        if (!cancelled) setLoadingToken(false);
      }
    }
    if (token) load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // لو الـ API مش بتدي orderId، نستخدم التوكن كـ fallback (السيرفر هيتحقق)
  const orderId = useMemo(() => tokenInfo?.orderId || token || "", [tokenInfo?.orderId, token]);

  async function submit() {
    if (!token) return;
    if (stars < 1 || stars > 5) {
      setError("اختر تقييمًا من 1 إلى 5 نجوم");
      return;
    }
    if (tokenInfo?.expired) {
      setError("عفوًا، انتهت صلاحية رابط التقييم.");
      return;
    }
    if (tokenInfo?.voided) {
      setError("عفوًا، تم إلغاء رابط التقييم.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body: SubmitBody = {
        orderId,
        stars,
        text,
        images: attachments.map((f) => f.cdnUrl),
        tokenId: token,
        platform: "salla", // عدّلها لو عندك تمييز للمنصة
      };

      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || data?.error) {
        // خرائط رسائل ألطف
        const msg =
          data?.message ||
          (data?.error === "duplicate_review"
            ? "تم استلام تقييم لهذا الطلب بالفعل."
            : data?.error === "token_order_mismatch"
            ? "الرمز لا يطابق رقم الطلب."
            : data?.error === "token_expired"
            ? "انتهت صلاحية الرمز."
            : data?.error === "token_voided"
            ? "تم إلغاء الرمز."
            : "تعذر إرسال التقييم.");
        throw new Error(msg);
      }

      setDone({ id: data?.id });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // شاشة التحميل الأولي
  if (!token || loadingToken) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-600">جارٍ التحميل…</p>
      </main>
    );
  }

  // شاشة بعد الإرسال
  if (done) {
    return (
      <>
        <Head>
          <title>شكرًا لتقييمك | ثقة</title>
        </Head>
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border rounded-2xl p-8 shadow">
            <h1 className="text-2xl font-bold text-green-700 mb-2">شكرًا لتقييمك! ✅</h1>
            <p className="text-gray-600 mb-6">
              تم استلام تقييمك بنجاح{done.id ? ` (#${done.id})` : ""}.
            </p>
            <Link href="/" className="inline-block px-4 py-2 rounded bg-green-600 text-white">
              العودة للصفحة الرئيسية
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>قيّم تجربتك | ثقة</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-lime-50 p-6">
        <div className="max-w-2xl w-full bg-white border rounded-2xl p-6 shadow" dir="rtl">
          <h1 className="text-2xl font-bold text-emerald-800 mb-1">قيّم تجربتك</h1>
          <p className="text-gray-600 mb-6">
            {tokenInfo?.storeName ? (
              <>من فضلك قيّم تجربتك مع <b>{tokenInfo.storeName}</b>{tokenInfo.customerName ? <> — {tokenInfo.customerName}</> : null}</>
            ) : (
              "الرجاء مشاركة رأيك لتحسين الخدمة"
            )}
          </p>

          {/* النجوم */}
          <div className="mb-5">
            <div className="flex gap-2" role="radiogroup" aria-label="تقييم النجوم">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  className={`text-3xl ${n <= stars ? "text-yellow-400" : "text-gray-300"}`}
                  aria-checked={n === stars}
                  role="radio"
                  aria-label={`تقييم ${n}`}
                >
                  ★
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-1">اختر من 1 إلى 5 نجوم</p>
          </div>

          {/* التعليق */}
          <div className="mb-5">
            <label className="block text-sm text-gray-700 mb-1">ملاحظاتك (اختياري)</label>
            <textarea
              className="w-full border rounded-lg p-3 min-h-[120px]"
              placeholder="اكتب تعليقك هنا…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={3000}
            />
            <p className="text-xs text-gray-400 mt-1">{text.length}/3000</p>
          </div>

          {/* المرفقات — Uploadcare */}
          <div className="mb-6">
            <label className="block text-sm text-gray-700 mb-2">صور التجربة (اختياري)</label>
            <UploadcareWidget value={attachments} onChange={setAttachments} />
          </div>

          {tokenInfo?.expired && (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
              انتهت صلاحية رابط التقييم. يمكن أن لا يتم قبول الإرسال.
            </p>
          )}
          {tokenInfo?.voided && (
            <p className="text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">
              تم إلغاء رابط التقييم من المتجر.
            </p>
          )}

          {error && <p className="text-red-600 mb-4">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
          >
            {submitting ? "جارٍ الإرسال…" : "إرسال التقييم"}
          </button>

          <p className="text-xs text-gray-400 mt-4">رمز التوكن: {token}</p>
          {orderId && <p className="text-xs text-gray-400">رقم الطلب: {orderId}</p>}
        </div>
      </main>
    </>
  );
}

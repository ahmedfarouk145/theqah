// src/pages/review/[token].tsx
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, Star, Loader2 } from "lucide-react";
import FirebaseStorageWidget from "@/components/FirebaseStorageWidget";

type UploadedFile = { url: string; name: string; size?: number; path: string };

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
  platform?: "salla" | "zid" | "manual" | "web";
};

export default function ReviewByTokenPage() {
  const router = useRouter();
  const isReady = router.isReady;

  // read token safely (could be string | string[] | undefined)
  const token = useMemo(() => {
    const t = router.query.token;
    return typeof t === "string" ? t : Array.isArray(t) ? t[0] : undefined;
  }, [router.query.token]);

  const [stars, setStars] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { id?: string }>(null);
  const [error, setError] = useState<string | null>(null);

  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

  // load token meta
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isReady) return;
      if (!token) {
        setLoadingToken(false);
        setTokenInfo(null);
        return;
      }
      setLoadingToken(true);
      setError(null);
      try {
        const r = await fetch(`/api/review-token?token=${encodeURIComponent(token)}`);
        if (!r.ok) {
          // 404 = مش مشكلة؛ هنشتغل بالتوكن فقط
          if (!cancelled) setTokenInfo({ tokenId: token });
          return;
        }
        const j = await r.json();
        if (!cancelled) {
          setTokenInfo({
            tokenId: token,
            orderId: j?.orderId || undefined,
            storeName: j?.storeName || undefined,
            customerName: j?.customer?.name || undefined,
            expired: Boolean(j?.expired),
            voided: Boolean(j?.voided),
          });
        }
      } catch {
        if (!cancelled) setTokenInfo({ tokenId: token });
      } finally {
        if (!cancelled) setLoadingToken(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isReady, token]);

  // fallback: استخدم token كـ orderId لو API ماقدّمش orderId
  const orderId = useMemo(() => tokenInfo?.orderId || token || "", [tokenInfo?.orderId, token]);

  async function submit() {
    if (!token) {
      setError("الرابط غير صالح.");
      return;
    }
    if (!orderId) {
      setError("رقم الطلب غير موجود في الرابط.");
      return;
    }
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
        images: attachments.map((f) => f.url),
        tokenId: token,
        platform: "web",
      };

      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || data?.error) {
        const msg =
          data?.message ||
          (data?.error === "missing_orderId" ? "رقم الطلب مفقود."
          : data?.error === "duplicate_review" ? "تم استلام تقييم لهذا الطلب بالفعل."
          : data?.error === "token_order_mismatch" ? "الرمز لا يطابق رقم الطلب."
          : data?.error === "token_expired" ? "انتهت صلاحية الرمز."
          : data?.error === "token_voided" ? "تم إلغاء الرمز."
          : data?.error || "تعذّر إرسال التقييم.");
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

  // waiting for router/query
  if (!isReady) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-lime-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-gray-600">جارٍ التحميل…</p>
        </motion.div>
      </main>
    );
  }

  // invalid link (no token)
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-red-50 to-pink-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white border rounded-2xl p-8 shadow-lg"
          dir="rtl"
        >
          {/* ✅ اللوجو */}
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="Logo" width={140} height={40} className="h-10 w-auto" priority />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <h1 className="text-xl font-bold text-red-700">الرابط غير صالح</h1>
          </div>
          <p className="text-gray-600 mb-6">
            يرجى التأكد من فتح الرابط الكامل المرسل إليك عبر SMS أو البريد الإلكتروني.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition"
          >
            العودة للصفحة الرئيسية
          </Link>
        </motion.div>
      </main>
    );
  }

  // initial token meta loading
  if (loadingToken) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-lime-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-gray-600">جارٍ التحقق من الرابط…</p>
        </motion.div>
      </main>
    );
  }

  // success page
  if (done) {
    return (
      <>
        <Head><title>شكرًا لتقييمك | ثقة</title></Head>
        <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-md w-full bg-white border rounded-2xl p-8 shadow-lg text-center"
            dir="rtl"
          >
            {/* ✅ اللوجو */}
            <div className="flex justify-center mb-4">
              <Image src="/logo.png" alt="Logo" width={160} height={48} className="h-12 w-auto" priority />
            </div>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 200 }}
              className="mb-6"
            >
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            </motion.div>
            <h1 className="text-2xl font-bold text-green-700 mb-3">شكرًا لتقييمك! ✨</h1>
            <p className="text-gray-600 mb-6">
              تم استلام تقييمك بنجاح وسيتم مراجعته قريباً{done.id ? ` (#${done.id})` : ""}.
              <br />
              تقييمك يساهم في تحسين تجربة العملاء الآخرين.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 transition font-medium"
            >
              العودة للصفحة الرئيسية
            </Link>
          </motion.div>
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl w-full bg-white border rounded-2xl p-8 shadow-lg"
          dir="rtl"
        >
          {/* ✅ اللوجو في الهيدر */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <Image src="/logo.png" alt="Logo" width={180} height={56} className="h-12 w-auto" priority />
            </div>
            <h1 className="text-3xl font-bold text-emerald-800 mb-2">قيّم تجربتك</h1>
            <p className="text-gray-600">
              {tokenInfo?.storeName ? (
                <>
                  نحن نقدر رأيك في تجربتك مع{" "}
                  <span className="font-semibold text-emerald-700">{tokenInfo.storeName}</span>
                  {tokenInfo.customerName ? <> — {tokenInfo.customerName}</> : null}
                </>
              ) : (
                "الرجاء مشاركة رأيك لتحسين الخدمة"
              )}
            </p>
          </div>

          {/* النجوم */}
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">كيف تقيم تجربتك؟</label>
            <div className="flex justify-center gap-2" role="radiogroup" aria-label="تقييم النجوم">
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  className={`text-4xl transition-colors ${
                    n <= stars ? "text-yellow-400" : "text-gray-300 hover:text-yellow-200"
                  }`}
                  aria-checked={n === stars}
                  role="radio"
                  aria-label={`تقييم ${n} ${n === 1 ? "نجمة" : "نجوم"}`}
                >
                  <Star className="h-10 w-10" fill={n <= stars ? "currentColor" : "none"} />
                </motion.button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">
              {stars === 0 && "اختر عدد النجوم"}
              {stars === 1 && "ضعيف - نحتاج للتحسين"}
              {stars === 2 && "مقبول - يمكن تحسينه"}
              {stars === 3 && "جيد - تجربة متوسطة"}
              {stars === 4 && "ممتاز - تجربة رائعة"}
              {stars === 5 && "استثنائي - تجربة مثالية"}
            </p>
          </div>

          {/* النص */}
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">شاركنا تفاصيل تجربتك (اختياري)</label>
            <textarea
              className="w-full border-2 border-gray-200 rounded-lg p-4 min-h-[120px] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors resize-none"
              placeholder="مثال: المنتج وصل في الوقت المحدد، الجودة ممتازة، خدمة العملاء مفيدة..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={3000}
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-sm text-gray-500">تعليقك يساعد المتجر في التحسين</p>
              <p className="text-xs text-gray-400">{text.length}/3000</p>
            </div>
          </div>

          {/* الصور */}
          <div className="mb-8">
            <label className="block text-lg font-medium text-gray-700 mb-3">صور التجربة (اختياري)</label>
            <p className="text-sm text-gray-500 mb-3">أضف صور المنتج أو التجربة لتجعل تقييمك أكثر فائدة</p>
            <FirebaseStorageWidget value={attachments} onChange={setAttachments} />
          </div>

          {/* تنبيهات صلاحية التوكن */}
          {tokenInfo?.expired && (
            <div className="flex items-center gap-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>انتهت صلاحية رابط التقييم. قد لا يتم قبول الإرسال.</p>
            </div>
          )}
          {tokenInfo?.voided && (
            <div className="flex items-center gap-3 text-red-700 bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>تم إلغاء رابط التقييم من المتجر.</p>
            </div>
          )}

          {/* أخطاء الإرسال */}
          {error && (
            <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* زر الإرسال */}
          <motion.button
            type="button"
            onClick={submit}
            disabled={submitting || stars === 0}
            whileHover={{ scale: submitting ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-4 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                جارٍ الإرسال…
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                {stars === 0 ? "اختر التقييم أولاً" : "إرسال التقييم"}
              </>
            )}
          </motion.button>

          {/* فوتر صغير */}
          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400 space-y-1">
            <div>رمز التوكن: {token ?? "—"}</div>
            <div>رقم الطلب: {orderId || "—"}</div>
            <p className="text-center mt-3">محمي بواسطة مشتري موثق - منصة التقييمات الموثوقة</p>
          </div>
        </motion.div>
      </main>
    </>
  );
}

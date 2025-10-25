// src/pages/review/[token].tsx
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, Star, Loader2 } from "lucide-react";
import FirebaseStorageWidget from "@/components/FirebaseStorageWidget";
import AnimatedLogo from "@/components/AnimatedLogo";

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

  const orderId = useMemo(() => tokenInfo?.orderId || token || "", [tokenInfo?.orderId, token]);

  async function submit() {
    if (!token) { setError("الرابط غير صالح."); return; }
    if (!orderId) { setError("رقم الطلب غير موجود في الرابط."); return; }
    if (stars < 1 || stars > 5) { setError("اختر تقييمًا من 1 إلى 5 نجوم"); return; }
    if (tokenInfo?.expired) { setError("عفوًا، انتهت صلاحية رابط التقييم."); return; }
    if (tokenInfo?.voided) { setError("عفوًا، تم إلغاء رابط التقييم."); return; }

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

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-pink-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-lg"
          dir="rtl"
        >
          <div className="flex justify-center mb-3">
            <AnimatedLogo width={160} glow pulse shine />
          </div>

          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h1 className="text-lg font-bold text-red-700">الرابط غير صالح</h1>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            يرجى التأكد من فتح الرابط الكامل المرسل إليك عبر SMS أو البريد الإلكتروني.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition text-sm"
          >
            العودة للصفحة الرئيسية
          </Link>
        </motion.div>
      </main>
    );
  }

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

  if (done) {
    return (
      <>
        <Head><title>شكرًا لتقييمك | ثقة</title></Head>
        <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-lg text-center"
            dir="rtl"
          >
            <div className="flex justify-center mb-3">
              <AnimatedLogo width={180} glow pulse shine />
            </div>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 200 }}
              className="mb-4"
            >
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            </motion.div>
            <h1 className="text-xl font-bold text-green-700 mb-2">شكرًا لتقييمك! ✨</h1>
            <p className="text-gray-600 text-sm mb-4">
              تم استلام تقييمك بنجاح وسيتم مراجعته قريباً{done.id ? ` (#${done.id})` : ""}.
              <br />
              تقييمك يساهم في تحسين تجربة العملاء الآخرين.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 transition font-medium text-sm"
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

      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-lime-50 p-4 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full bg-white border rounded-2xl shadow-lg overflow-hidden"
          dir="rtl"
        >
          {/* Header مع اللوجو */}
          <div className="text-center p-4 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
            <div className="flex justify-center mb-2">
              <AnimatedLogo width={120} glow pulse shine />
            </div>
            <h1 className="text-lg font-bold mb-1">قيّم تجربتك</h1>
            <p className="text-emerald-100 text-sm">
              {tokenInfo?.storeName ? (
                <>مع <span className="font-semibold">{tokenInfo.storeName}</span></>
              ) : (
                "شاركنا رأيك"
              )}
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* النجوم */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">كيف تقيم تجربتك؟</label>
              <div className="flex justify-center gap-1" role="radiogroup" aria-label="تقييم النجوم">
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`text-2xl transition-colors ${
                      n <= stars ? "text-yellow-400" : "text-gray-300 hover:text-yellow-200"
                    }`}
                    aria-checked={n === stars}
                    role="radio"
                    aria-label={`تقييم ${n} ${n === 1 ? "نجمة" : "نجوم"}`}
                  >
                    <Star className="h-8 w-8" fill={n <= stars ? "currentColor" : "none"} />
                  </motion.button>
                ))}
              </div>
              <p className="text-center text-xs text-gray-500 mt-1">
                {stars === 0 && "اختر عدد النجوم"}
                {stars === 1 && "ضعيف"}
                {stars === 2 && "مقبول"}
                {stars === 3 && "جيد"}
                {stars === 4 && "ممتاز"}
                {stars === 5 && "استثنائي"}
              </p>
            </div>

            {/* النص */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">تعليقك (اختياري)</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition-colors resize-none"
                placeholder="شاركنا تفاصيل تجربتك..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-gray-400">اختياري</p>
                <p className="text-xs text-gray-400">{text.length}/500</p>
              </div>
            </div>

            {/* الصور */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">صور (اختياري)</label>
              <div className="text-xs text-gray-500 mb-2">أضف صور المنتج لتجعل تقييمك أكثر فائدة</div>
              <FirebaseStorageWidget value={attachments} onChange={setAttachments} />
            </div>

            {/* تنبيهات */}
            {(tokenInfo?.expired || tokenInfo?.voided) && (
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p>
                  {tokenInfo?.expired && "انتهت صلاحية الرابط."}
                  {tokenInfo?.voided && "تم إلغاء الرابط من المتجر."}
                </p>
              </div>
            )}

            {/* خطأ الإرسال */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-xs">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
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
              className="w-full py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الإرسال…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {stars === 0 ? "اختر التقييم أولاً" : "إرسال التقييم"}
                </>
              )}
            </motion.button>

            {/* فوتر مبسط */}
            <div className="pt-3 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">محمي بواسطة ثقة - منصة التقييمات الموثوقة</p>
            </div>
          </div>
        </motion.div>
      </main>
    </>
  );
}
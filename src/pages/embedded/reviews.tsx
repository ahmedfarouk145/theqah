// src/pages/embedded/reviews.tsx
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type PublicReview = {
  id: string;
  stars: number; // 0..5
  text?: string;
  images?: string[];
  createdAt: number; // ms
  buyerVerified: boolean;
  storeUid: string;
  productId: string;
};

function StarRow({ stars }: { stars: number }) {
  const s = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <div className="flex gap-1" aria-label={`تقييم ${s} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= s ? "text-yellow-400" : "text-gray-300"}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function EmbeddedReviews() {
  const params = useMemo(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      ),
    []
  );

  const storeUid = params.get("storeUid") || "";
  const productId = params.get("productId") || "";
  const limitParam = Number(params.get("limit") || 10);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(50, limitParam))
    : 10;

  const rtl = params.get("rtl") === "0" ? false : true;
  const dir: "rtl" | "ltr" = rtl ? "rtl" : "ltr";
  const bg = params.get("bg") || "white";

  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!storeUid || !productId) {
        setError("storeUid و productId مطلوبة");
        setLoading(false);
        return;
      }
      try {
        const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "";
        const url =
          (base ? `${base}` : "") +
          `/api/public/reviews?storeUid=${encodeURIComponent(
            storeUid
          )}&productId=${encodeURIComponent(productId)}&limit=${limit}`;
        const res = await fetch(url);
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message || "تعذر جلب المراجعات");
        setReviews(Array.isArray(j.reviews) ? j.reviews : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "خطأ غير متوقع");
      } finally {
        setLoading(false);
      }
    })();
  }, [storeUid, productId, limit]);

  return (
    <main dir={dir} style={{ background: bg }} className="min-h-[60px] text-gray-800">
      <div className="p-4">
        {loading && <div className="text-sm text-gray-500">جارٍ التحميل…</div>}
        {error && <div className="text-sm text-rose-600">{error}</div>}

        {!loading && !error && reviews.length === 0 && (
          <div className="text-sm text-gray-500">لا توجد مراجعات منشورة بعد.</div>
        )}

        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <StarRow stars={r.stars} />
                {r.buyerVerified && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                    ✅ مشتري ثقة
                  </span>
                )}
              </div>

              {r.text && <p className="text-sm leading-6 whitespace-pre-wrap">{r.text}</p>}

              {!!(r.images && r.images.length) && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {r.images.slice(0, 6).map((u) => (
                    <div key={u} className="relative w-full h-24">
                      {/* استخدام next/image لتفادي تحذير @next/next/no-img-element */}
                      <Image
                        src={u}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 33vw, 200px"
                        className="object-cover rounded-lg border"
                        // إن كنت تستخدم Uploadcare أو روابط خارجية غير معرفة في next.config:
                        unoptimized
                        // لو أردت استخدام loader مخصص بدلاً من unoptimized:
                        // loader={({ src }) => src}
                        // priority={false}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 text-[11px] text-gray-400">
                {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

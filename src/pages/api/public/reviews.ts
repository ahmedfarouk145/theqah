// src/pages/api/public/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

// -------- helpers --------
type QueryLike = NextApiRequest["query"];
const getStr = (q: QueryLike, keys: string[], fallback = ""): string => {
  for (const k of keys) {
    const v = q[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return fallback;
};

const parseQuery = (q: QueryLike) => {
  const storeUid = getStr(q, ["storeUid", "storeId", "store", "s"]);
  const productId = getStr(q, ["productId", "product", "p", "sku"], "");
  const limit = Math.min(100, Math.max(1, Number(getStr(q, ["limit"], "20")) || 20));
  const sort = (getStr(q, ["sort", "order"], "desc").toLowerCase() === "asc" ? "asc" : "desc") as "asc" | "desc";
  const sinceDays = Math.max(0, Number(getStr(q, ["sinceDays", "days", "since"], "")) || 0);
  
  // ✅ إضافة pagination
  const page = Math.max(1, Number(getStr(q, ["page"], "1")) || 1);
  const cursor = getStr(q, ["cursor", "after"], "");
  
  return { storeUid, productId, limit, sort, sinceDays, page, cursor };
};

// -------- public shape --------
type PublicReview = {
  id: string;
  productId: string | null;
  stars: number;
  text: string;
  publishedAt: number;     // ms
  trustedBuyer: boolean;
  author: { displayName: string }; // 👈 فقط displayName
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-theqah-widget");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }

  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const { storeUid, productId, limit, sort, sinceDays, page, cursor } = parseQuery(req.query);
  if (!storeUid) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(400).json({ error: "MISSING_PARAMS", need: ["storeUid"] });
  }

  try {
    const db = dbAdmin();

    let q: FirebaseFirestore.Query = db
      .collection("reviews")
      .where("storeUid", "==", storeUid)
      .where("status", "==", "published")
      .where("published", "==", true); // ✅ نتأكد إن published = true

    if (productId) q = q.where("productId", "==", productId);

    const now = Date.now();
    const cutoff = sinceDays > 0 ? now - sinceDays * 24 * 60 * 60 * 1000 : 0;
    if (cutoff > 0) q = q.where("publishedAt", ">=", cutoff);

    q = q.orderBy("publishedAt", sort as FirebaseFirestore.OrderByDirection);

    // ✅ إضافة Pagination
    if (cursor) {
      // Cursor-based pagination (الأفضل للأداء)
      const cursorDoc = await db.collection("reviews").doc(cursor).get();
      if (cursorDoc.exists) {
        q = q.startAfter(cursorDoc);
      }
    } else if (page > 1) {
      // Offset-based pagination (بديل)
      const offset = (page - 1) * limit;
      q = q.offset(offset);
    }

    q = q.limit(limit);
    const snap = await q.get();

    // ✅ نفلتر التقييمات أكتر لنتأكد من شروط العرض
    const items: PublicReview[] = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        
        // ✅ نتحقق من author.show
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const author = data["author"] as any;
        const authorShow = author?.show;
        
        // ✅ إذا author.show = false، مانعرضوش
        if (authorShow === false) {
          return null;
        }

        const stars = Math.max(0, Math.min(5, Number(data["stars"] ?? 0)));
        const text =
          (typeof data["text"] === "string" && data["text"]) ||
          (typeof data["comment"] === "string" && data["comment"]) ||
          "";

        const publishedAt =
          (typeof data["publishedAt"] === "number" && data["publishedAt"]) ||
          (typeof data["createdAt"] === "number" && data["createdAt"]) ||
          (data["createdAt"] ? Date.parse(String(data["createdAt"])) : 0);

        const trustedBuyer = Boolean(
          (typeof data["trustedBuyer"] === "boolean" && data["trustedBuyer"]) ||
          (typeof data["buyerVerified"] === "boolean" && data["buyerVerified"])
        );

        // 👇 نرجّع فقط displayName من author
        const displayName =
          (author && typeof author.displayName === "string"
            ? author.displayName
            : "عميل المتجر");

        return {
          id: d.id,
          productId: typeof data["productId"] === "string" ? data["productId"] : null,
          stars,
          text,
          publishedAt,
          trustedBuyer,
          author: { displayName },
        };
      })
      .filter((item): item is PublicReview => item !== null); // ✅ نشيل اللي null

    // ✅ معلومات Pagination
    const hasMore = snap.docs.length === limit;
    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = hasMore && lastDoc ? lastDoc.id : null;
    const nextPage = hasMore ? page + 1 : null;

    const pagination = {
      page,
      limit,
      hasMore,
      nextPage,
      nextCursor,
      totalItems: items.length,
    };

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    return res.status(200).json({ 
      items,
      pagination 
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("public/reviews error:", message);
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: "PUBLIC_LIST_FAILED", message });
  }
}

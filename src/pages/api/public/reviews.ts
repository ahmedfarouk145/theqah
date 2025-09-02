// src/pages/api/public/reviews.ts
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
  const sort = (getStr(q, ["sort", "order"], "desc").toLowerCase() === "asc" ? "asc" : "desc") as
    | "asc"
    | "desc";
  const sinceDays = Math.max(0, Number(getStr(q, ["sinceDays", "days"], "")) || 0);
  return { storeUid, productId, limit, sort, sinceDays };
};

// -------- public shape --------
type PublicReview = {
  id: string;
  productId: string | null;
  stars: number;
  text: string;
  publishedAt: number;     // ms
  trustedBuyer: boolean;
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

  const { storeUid, productId, limit, sort, sinceDays } = parseQuery(req.query);
  if (!storeUid) {
    return res.status(400).json({ error: "MISSING_PARAMS", need: ["storeUid"] });
  }

  try {
    const db = dbAdmin();

    // بناء الاستعلام ديناميكياً
    let q = db
      .collection("reviews")
      .where("storeUid", "==", storeUid)
      .where("status", "==", "published");

    if (productId) q = q.where("productId", "==", productId);

    // sinceDays => فلترة على publishedAt (لو فيه)
    const now = Date.now();
    const cutoff = sinceDays > 0 ? now - sinceDays * 24 * 60 * 60 * 1000 : 0;
    if (cutoff > 0) {
      q = q.where("publishedAt", ">=", cutoff);
    }

    q = q.orderBy("publishedAt", sort as FirebaseFirestore.OrderByDirection).limit(limit);

    // ملاحظة: أول مرة ممكن يطلب منك Firestore تعمل index مركّب للاستعلام ده.
    const snap = await q.get();

    const items: PublicReview[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
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

      return {
        id: d.id,
        productId: typeof data["productId"] === "string" ? data["productId"] : null,
        stars,
        text,
        publishedAt,
        trustedBuyer,
      };
    });

    // CORS (في الإنتاج بدّل * بقائمة دوميناتك)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300"); // اختياري: كاش بسيط
    return res.status(200).json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("public/reviews error:", message);
    return res.status(500).json({ error: "PUBLIC_LIST_FAILED", message });
  }
}

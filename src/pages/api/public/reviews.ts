// src/pages/api/public/reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

// -------- helpers: query parsing (no any) --------
type QueryLike = NextApiRequest["query"];

function pickQuery(q: QueryLike, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = q[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return fallback;
}

function norm(q: QueryLike) {
  const storeUid = pickQuery(q, ["storeUid", "storeId", "store", "s"]);
  const productId = pickQuery(q, ["productId", "product", "p", "sku"]);
  const limitStr = pickQuery(q, ["limit"], "20");
  const limitNum = Math.min(100, Math.max(1, Number(limitStr || 20)));
  return { storeUid, productId, limit: limitNum };
}

// -------- helpers: safe coercions from Firestore --------
const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asNumber = (v: unknown): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;
const asBoolean = (v: unknown): boolean => (typeof v === "boolean" ? v : false);
//eslint-disable-next-line @typescript-eslint/no-unused-vars
function toTimestamp(v: number | string | undefined | null): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Date.parse(String(v));
}

// -------- public shape --------
type PublicReview = {
  id: string;
  productId: string | null;
  stars: number;
  text: string;
  createdAt: number | string | null;
  buyerVerified: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Optional preflight for CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }

  try {
    if (req.method !== "GET") return res.status(405).end();

    const { storeUid, productId, limit } = norm(req.query);
    if (!storeUid || !productId) {
      return res
        .status(400)
        .json({ error: "MISSING_PARAMS", need: ["storeUid", "productId"] });
    }

    const db = dbAdmin();
    const qRef = db
      .collection("reviews")
      .where("storeUid", "==", storeUid)
      .where("productId", "==", productId)
      .where("status", "==", "published")
      .orderBy("createdAt", "desc")
      .limit(limit);

    const snap = await qRef.get();

    const items: PublicReview[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;

      const productIdVal = asString(data["productId"]);
      const starsVal = Math.max(0, Math.min(5, asNumber(data["stars"])));
      const textVal =
        asString(data["text"]) ??
        (asString(data["comment"]) ?? "");
      const createdRaw =
        (data["createdAt"] as number | string | undefined) ??
        (data["created"] as number | string | undefined) ??
        null;
      const buyerVerifiedVal =
        asBoolean(data["buyerVerified"]) || asBoolean(data["trustedBuyer"]);

      return {
        id: d.id,
        productId: productIdVal,
        stars: starsVal,
        text: textVal,
        createdAt: createdRaw,
        buyerVerified: buyerVerifiedVal,
      };
    });

    // CORS (allow-list domains في الإنتاج بدلاً من *)
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(e);
    return res
      .status(500)
      .json({ error: "PUBLIC_LIST_FAILED", message });
  }
}

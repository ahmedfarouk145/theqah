// src/pages/api/public/reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { ReviewService } from "@/server/services/review.service";
import { handleApiError } from "@/server/core/error-handler";
import { ValidationError } from "@/server/core/errors";

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
  return { storeUid, productId, limit, sort, sinceDays };
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

  // Rate limiting - 100 requests per 15 minutes per IP
  const limited = await rateLimitPublic(req, res, {
    ...RateLimitPresets.PUBLIC_MODERATE,
    identifier: "public-reviews"
  });
  if (limited) return; // 429 response already sent

  try {
    const { storeUid, productId, limit, sort, sinceDays } = parseQuery(req.query);

    if (!storeUid) {
      throw new ValidationError("Missing storeUid parameter", "storeUid");
    }

    const reviewService = new ReviewService();
    const items = await reviewService.getPublicReviews(storeUid, {
      productId: productId || undefined,
      limit,
      sort,
      sinceDays,
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    return res.status(200).json({ items });
  } catch (error) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    handleApiError(res, error);
  }
}

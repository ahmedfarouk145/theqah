// src/pages/api/reviews/export-csv.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyUser } from "@/utils/verifyUser";

type Row = {
  id: string;
  storeUid: string | null;
  productId: string | null;
  orderId: string | null;
  buyerVerified: boolean;
  stars: number;
  text: string;
  images: string[];
  createdAt: number | string;
  published: boolean;
  status: string;
};

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function toTimestamp(v: number | string | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Date.parse(v);
}

// ---- Safe coercion helpers (no any) ----
const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asNumber = (v: unknown): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;
const asBoolean = (v: unknown): boolean => (typeof v === "boolean" ? v : false);
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).end();

    const { uid } = await verifyUser(req);

    // optional filters
    const { productId, minStars, maxStars, from, to } = req.query as {
      productId?: string;
      minStars?: string;
      maxStars?: string;
      from?: string;
      to?: string;
    };

    // stars bounds
    const lo = Math.max(1, Math.min(5, Number(minStars || 1)));
    const hi = Math.max(lo, Math.min(5, Number(maxStars || 5)));

    const fromTs = from ? Date.parse(from) : 0;
    const toTs = to ? Date.parse(to) : Number.MAX_SAFE_INTEGER;

    const db = dbAdmin();
    let q = db.collection("reviews").where("storeUid", "==", uid);
    if (productId) q = q.where("productId", "==", productId);

    const snap = await q.get();

    const rows: Row[] = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;

        const storeUid = asString(data["storeUid"]);
        const productIdVal = asString(data["productId"]);
        const orderId = asString(data["orderId"]);

        const buyerVerified =
          asBoolean(data["buyerVerified"]) ||
          asBoolean(data["trustedBuyer"]); // alias support

        const stars = asNumber(data["stars"]);

        const text =
          asString(data["text"]) ??
          (asString(data["comment"]) ?? ""); // alias support

        const images = asStringArray(data["images"]);

        const createdAtRaw =
          (data["createdAt"] as number | string | undefined) ??
          (data["created"] as number | string | undefined) ??
          "";

        const status = asString(data["status"]) ?? "";

        const published =
          asBoolean(data["published"]) || status === "published";

        return {
          id: d.id,
          storeUid,
          productId: productIdVal,
          orderId,
          buyerVerified,
          stars,
          text,
          images,
          createdAt: createdAtRaw,
          published,
          status,
        };
      })
      .filter((r) => {
        const okStars = r.stars >= lo && r.stars <= hi;
        const t = toTimestamp(
          typeof r.createdAt === "number" ? r.createdAt : String(r.createdAt || "")
        );
        const okRange = t >= fromTs && t <= toTs;
        return okStars && okRange;
      })
      .sort(
        (a, b) =>
          toTimestamp(
            typeof b.createdAt === "number" ? b.createdAt : String(b.createdAt || "")
          ) -
          toTimestamp(
            typeof a.createdAt === "number" ? a.createdAt : String(a.createdAt || "")
          )
      );

    // CSV (+ Arabic-friendly BOM for Excel)
    const header = [
      "id",
      "storeUid",
      "productId",
      "orderId",
      "buyerVerified",
      "stars",
      "text",
      "images",
      "createdAt",
      "published",
      "status",
    ];

    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          escapeCsv(r.id),
          escapeCsv(r.storeUid ?? ""),
          escapeCsv(r.productId ?? ""),
          escapeCsv(r.orderId ?? ""),
          escapeCsv(r.buyerVerified ? "true" : "false"),
          escapeCsv(r.stars),
          escapeCsv(r.text),
          escapeCsv(r.images.join(" | ")),
          escapeCsv(r.createdAt),
          escapeCsv(r.published ? "true" : "false"),
          escapeCsv(r.status || (r.published ? "published" : "")),
        ].join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reviews-${uid}.csv"`
    );
    return res.status(200).send("\ufeff" + csv); // BOM
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: "EXPORT_CSV_FAILED", message });
  }
}

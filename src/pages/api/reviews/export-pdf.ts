// src/pages/api/reviews/export-pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import path from "path";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyUser } from "@/utils/verifyUser";

export const config = { api: { responseLimit: "12mb" } };

type PdfRow = {
  id: string;
  productId: string | null;
  stars: number;
  orderId: string | null;
  buyerVerified: boolean;
  published: boolean;
  status: string;
  text: string;
  createdAt: number | string;
};

function toTimestamp(v: number | string | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Date.parse(v);
}

// Helpers to safely coerce unknown values
const asStringOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

const asNumber = (v: unknown): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

const asBoolean = (v: unknown): boolean =>
  typeof v === "boolean" ? v : false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).end();

    const { uid } = await verifyUser(req);

    const { productId, from, to } = req.query as {
      productId?: string;
      from?: string;
      to?: string;
    };

    const fromTs = from ? Date.parse(from) : 0;
    const toTs = to ? Date.parse(to) : Number.MAX_SAFE_INTEGER;

    const db = dbAdmin();
    let q = db.collection("reviews").where("storeUid", "==", uid);
    if (productId) q = q.where("productId", "==", productId);

    const snap = await q.get();

    const rows: PdfRow[] = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;

        const productIdVal = asStringOrNull(data.productId);
        const stars = asNumber(data.stars);
        const orderIdVal = asStringOrNull(data.orderId);

        const statusVal = typeof data.status === "string" ? data.status : "";

        const publishedVal =
          typeof data.published === "boolean"
            ? data.published
            : statusVal === "published";

        const buyerVerifiedVal =
          typeof data.buyerVerified === "boolean"
            ? data.buyerVerified
            : asBoolean((data as Record<string, unknown>).trustedBuyer);

        const textVal =
          typeof data.text === "string"
            ? data.text
            : typeof (data as Record<string, unknown>).comment === "string"
            ? String((data as Record<string, unknown>).comment)
            : "";

        const createdAtRaw =
          (data.createdAt as number | string | undefined) ??
          (data.created as number | string | undefined) ??
          0;

        return {
          id: d.id,
          productId: productIdVal,
          stars,
          orderId: orderIdVal,
          buyerVerified: buyerVerifiedVal,
          published: publishedVal,
          status: statusVal,
          text: textVal,
          createdAt: createdAtRaw,
        };
      })
      .filter((r) => {
        const t = toTimestamp(r.createdAt);
        return t >= fromTs && t <= toTs;
      })
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="reviews-${uid}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 36 });
    doc.pipe(res);

    // محاولة تسجيل خط عربي (اختياري) لو الملف موجود في public/fonts
    try {
      const fontPath = path.join(process.cwd(), "public", "fonts", "Tajawal-Regular.ttf");
      // registerFont متاحة في أنواع pdfkit الحديثة
      doc.registerFont("arabic", fontPath);
      doc.font("arabic");
    } catch {
      // fallback لخط النظام إذا لم يتوفر الخط
    }

    doc.fontSize(18).text("تقارير التقييمات (ثقة)", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Store UID: ${uid}`, { align: "center" });
    doc.moveDown();

    const pageBottom = () => doc.page.height - doc.page.margins.bottom;

    rows.forEach((r, i) => {
      // فاصل صفحات بسيط
      if (doc.y > pageBottom() - 120) doc.addPage();

      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(`#${i + 1} — ${r.productId ?? "—"} — ${r.stars}★`, { align: "right" });

      doc
        .fontSize(10)
        .text(
          `Order: ${r.orderId ?? "—"} | Verified: ${r.buyerVerified ? "Yes" : "No"} | ` +
            `Status: ${r.status || (r.published ? "published" : "—")}`,
          { align: "right" }
        );

      if (r.text) {
        doc.moveDown(0.2).fontSize(11).text(r.text, { align: "right" });
      }

      const when = toTimestamp(r.createdAt);
      if (when) {
        doc
          .moveDown(0.2)
          .fontSize(9)
          .fillColor("#555")
          .text(`Created: ${new Date(when).toLocaleString()}`, { align: "right" })
          .fillColor("#000");
      }

      doc.moveDown(0.3);
      doc
        .strokeColor("#ddd")
        .lineWidth(1)
        .moveTo(36, doc.y)
        .lineTo(doc.page.width - 36, doc.y)
        .stroke();
    });

    doc.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: "EXPORT_PDF_FAILED", message });
  }
}

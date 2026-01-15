// src/pages/api/reviews/export-pdf.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';
import path from 'path';
import { verifyUser } from '@/utils/verifyUser';
import { ExportService } from '@/server/services/export.service';

export const config = { api: { responseLimit: '12mb' } };

function toTimestamp(v: number | string | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Date.parse(String(v));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();

    const { uid } = await verifyUser(req);
    const { productId, from, to } = req.query as Record<string, string | undefined>;

    const fromTs = from ? Date.parse(from) : 0;
    const toTs = to ? Date.parse(to) : Number.MAX_SAFE_INTEGER;

    const exportService = new ExportService();
    const rows = await exportService.getReviewsForExport(uid, { productId, fromTs, toTs });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reviews-${uid}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);

    // Try Arabic font
    try {
      const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Tajawal-Regular.ttf');
      doc.registerFont('arabic', fontPath);
      doc.font('arabic');
    } catch { /* fallback */ }

    doc.fontSize(18).text('تقارير التقييمات (ثقة)', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Store UID: ${uid}`, { align: 'center' });
    doc.moveDown();

    const pageBottom = () => doc.page.height - doc.page.margins.bottom;

    rows.forEach((r, i) => {
      if (doc.y > pageBottom() - 120) doc.addPage();

      doc.moveDown(0.5);
      doc.fontSize(12).text(`#${i + 1} — ${r.productId ?? '—'} — ${r.stars}★`, { align: 'right' });
      doc.fontSize(10).text(
        `Order: ${r.orderId ?? '—'} | Verified: ${r.buyerVerified ? 'Yes' : 'No'} | Status: ${r.status || (r.published ? 'published' : '—')}`,
        { align: 'right' }
      );

      if (r.text) {
        doc.moveDown(0.2).fontSize(11).text(r.text, { align: 'right' });
      }

      const when = toTimestamp(r.createdAt);
      if (when) {
        doc.moveDown(0.2).fontSize(9).fillColor('#555')
          .text(`Created: ${new Date(when).toLocaleString()}`, { align: 'right' })
          .fillColor('#000');
      }

      doc.moveDown(0.3);
      doc.strokeColor('#ddd').lineWidth(1)
        .moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
    });

    doc.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: 'EXPORT_PDF_FAILED', message });
  }
}

// src/pages/api/reviews/export-csv.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyUser } from '@/utils/verifyUser';
import { ExportService } from '@/server/services/export.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();

    const { uid } = await verifyUser(req);
    const { productId, minStars, maxStars, from, to } = req.query as Record<string, string | undefined>;

    const lo = Math.max(1, Math.min(5, Number(minStars || 1)));
    const hi = Math.max(lo, Math.min(5, Number(maxStars || 5)));
    const fromTs = from ? Date.parse(from) : 0;
    const toTs = to ? Date.parse(to) : Number.MAX_SAFE_INTEGER;

    const exportService = new ExportService();
    const rows = await exportService.getReviewsForExport(uid, {
      productId,
      minStars: lo,
      maxStars: hi,
      fromTs,
      toTs,
    });

    const csv = exportService.generateCsv(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reviews-${uid}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: 'EXPORT_CSV_FAILED', message });
  }
}

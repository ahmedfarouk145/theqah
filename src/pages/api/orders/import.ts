// src/pages/api/orders/import.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable, { type Fields, type Files, type File } from 'formidable';
import fs from 'fs/promises';
import { parse as parseCsv } from 'csv-parse/sync';
import { verifyStore, type AuthedRequest } from '@/utils/verifyStore';
import { OrderService } from '@/server/services/order.service';

export const config = { api: { bodyParser: false } };

type OrderRecord = {
  name: string;
  phone: string;
  email?: string;
  orderId: string;
  productId: string;
  storeName: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || 'Unauthorized' });
  }

  const form = new formidable.IncomingForm();

  try {
    const [, files]: [Fields, Files] = await form.parse(req);

    const csvFile = files.csv as File | File[] | undefined;
    if (!csvFile) return res.status(400).json({ message: 'CSV upload error (no file)' });

    const fileObj = Array.isArray(csvFile) ? csvFile[0] : csvFile;
    if (!fileObj?.filepath) return res.status(400).json({ message: 'CSV upload error (invalid file)' });

    const filePath = fileObj.filepath;
    const buf = await fs.readFile(filePath);

    const records = parseCsv(buf, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as OrderRecord[];

    const { storeId } = req as AuthedRequest;

    const orderService = new OrderService();
    const result = await orderService.importFromCsv(storeId ?? '', records);

    // Cleanup temp file
    try { await fs.unlink(filePath); } catch { }

    return res.status(200).json({
      message: 'Orders imported successfully',
      ...result,
    });
  } catch (e) {
    console.error('Import error:', e);
    return res.status(400).json({ message: 'CSV parse/upload error' });
  }
}

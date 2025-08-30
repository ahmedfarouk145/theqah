// src/pages/api/orders/import.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable, { type Fields, type Files, type File } from 'formidable';
import fs from 'fs/promises';
import { parse as parseCsv } from 'csv-parse/sync';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { verifyStore, type AuthedRequest } from '@/utils/verifyStore';

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
  // ✅ verifyStore now takes only (req) and throws on failure
  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const form = new formidable.IncomingForm();

  try {
    // ✅ formidable v3 Promise API: parse(req) → [fields, files]
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

    let inserted = 0;
    let skipped = 0;

    for (const raw of records) {
      const name = String(raw.name ?? '').trim();
      const phone = String(raw.phone ?? '').trim();
      const email = raw.email ? String(raw.email).trim() : undefined;
      const orderId = String(raw.orderId ?? '').trim();
      const productId = String(raw.productId ?? '').trim();
      const storeName = String(raw.storeName ?? '').trim();

      if (!name || !phone || !orderId || !productId || !storeName) {
        skipped++;
        continue;
      }

      await addDoc(collection(db, 'orders'), {
        name,
        phone,
        email: email || undefined,
        orderId,
        productId,
        storeName,
        storeId: storeId ?? null,
        sent: false,
        createdAt: new Date().toISOString(),
      });

      inserted++;
    }

    // best-effort cleanup
    try { await fs.unlink(filePath); } catch {}

    return res.status(200).json({
      message: 'Orders imported successfully',
      inserted,
      skipped,
      total: records.length,
    });
  } catch (e) {
    console.error('Import error:', e);
    return res.status(400).json({ message: 'CSV parse/upload error' });
  }
}

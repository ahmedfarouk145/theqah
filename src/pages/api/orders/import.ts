import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'csv-parse';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { verifyStore } from '@/utils/verifyStore';

import formidable, { Fields, Files, File } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

type OrderRecord = {
  name: string;
  phone: string;
  email?: string;
  orderId: string;
  productId: string;
  storeName: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const form = new formidable.IncomingForm();

  form.parse(req, async (err: Error | null, fields: Fields, files: Files) => {
    if (err || !files.csv) {
      return res.status(400).json({ message: 'CSV upload error' });
    }

    const file = Array.isArray(files.csv) ? files.csv[0] : files.csv;
    const filePath = (file as File).filepath;
    const data = fs.readFileSync(filePath);

    parse(data, { columns: true, skip_empty_lines: true }, async (parseErr: Error | undefined, records: OrderRecord[]) => {
      if (parseErr) {
        return res.status(400).json({ message: 'CSV parse error' });
      }

      const storeId = (req as { storeId?: string }).storeId;

      for (const record of records) {
        const { name, phone, email, orderId, productId, storeName } = record;
        if (!name || !phone || !orderId || !productId || !storeName) continue;

        await addDoc(collection(db, 'orders'), {
          name,
          phone,
          email,
          orderId,
          productId,
          storeName,
          storeId,
          sent: false,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(200).json({ message: 'Orders imported successfully' });
    });
  });
}

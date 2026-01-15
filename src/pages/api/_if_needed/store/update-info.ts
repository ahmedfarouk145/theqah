// src/pages/api/store/update-info.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { getAuthFromRequest } from '@/utils/getAuthFromRequest';
import { doc, updateDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { uid } = await getAuthFromRequest(req);
    const { name, email, phone, description, domain, logoUrl } = req.body;

    await updateDoc(doc(db, 'stores', uid), {
      name,
      email,
      phone,
      description,
      domain,
      logoUrl,
    });

    return res.status(200).json({ message: 'Store info updated' });
  } catch (error) {
    console.error('Update store info error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}

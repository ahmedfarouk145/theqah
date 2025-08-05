// src/pages/api/sms-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { MessageSid, MessageStatus, To } = req.body;

  console.log(`Delivery Status Update: ${To} => ${MessageStatus}`);

  try {
    // افترض أنك تخزن sid في الطلب مسبقًا أو تبحث بالهاتف
    // يمكنك تحديث حالة الرسالة في order مثلاً

    return res.status(200).end();
  } catch (error) {
    console.error('Delivery callback error:', error);
    return res.status(500).end();
  }
}

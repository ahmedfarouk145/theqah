// src/pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendSMS } from '@/utils/sms';
import { sendEmail } from '@/utils/email';
import { sendWhatsApp } from '@/utils/whatsapp';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, phone, storeName, orderId, storeUrl, email, productId } = req.body;

    if (!name || !phone || !orderId || !storeName || !productId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const docRef = await addDoc(collection(db, 'orders'), {
      name,
      phone,
      email,
      storeName,
      storeUrl,
      orderId,
      productId,
      sent: false,
      createdAt: new Date().toISOString(),
    });

    const reviewLink = `${process.env.NEXT_PUBLIC_BASE_URL}/review/${docRef.id}`;

    await sendSMS(phone, name, storeName, reviewLink);

    if (email) {
      await sendEmail({ to: email, name, storeName, reviewLink });
    }

    await sendWhatsApp(phone, name, storeName, reviewLink);

    return res.status(200).json({ message: 'Order saved and notification sent', id: docRef.id });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

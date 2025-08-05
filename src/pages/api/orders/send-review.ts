import type { NextApiRequest, NextApiResponse } from 'next';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendSMS } from '@/utils/sms';
import { sendEmail } from '@/utils/email';
import { sendWhatsApp } from '@/utils/whatsapp';
import { verifyStore } from '@/utils/verifyStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'Missing order ID' });

    const orderRef = doc(db, 'orders', id);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderSnap.data();
    const reviewLink = `${process.env.NEXT_PUBLIC_BASE_URL}/review/${id}`;

    await sendSMS(order.phone, order.name, order.storeName, reviewLink);
    if (order.email) {
      await sendEmail({ to: order.email, name: order.name, storeName: order.storeName, reviewLink });
    }
    await sendWhatsApp(order.phone, order.name, order.storeName, reviewLink);

    await updateDoc(orderRef, { sent: true });

    return res.status(200).json({ message: 'Review link sent' });
  } catch (error) {
    console.error('Send Review Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
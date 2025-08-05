// File: src/pages/api/salla/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const event = req.headers['x-salla-event'] as string;
  const payload = req.body;

  console.log('[SALLA EVENT]', event, JSON.stringify(payload, null, 2));

  try {
    switch (event) {
      case 'app.store.authorize': {
        const { store_id, access_token, refresh_token } = payload.data;

        if (!store_id || !access_token || !refresh_token) break;

        const storeRef = doc(db, 'stores', store_id.toString());
        await setDoc(
          storeRef,
          {
            salla: {
              access_token,
              refresh_token,
              connectedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );

        console.log('✅ تم ربط المتجر بالتطبيق:', store_id);
        break;
      }

      case 'orders.create': {
        const order = payload.data;
        const storeId = payload.store_id;

        if (!storeId || !order) break;

        await setDoc(doc(db, 'orders', order.id.toString()), {
          id: order.id.toString(),
          storeId: storeId.toString(),
          customer: {
            name: order.customer?.name || '',
            email: order.customer?.email || '',
            phone: order.customer?.mobile || '',
            id: order.customer?.id?.toString() || '',
          },
          createdAt: new Date(order.created_at),
          status: order.status,
          total: order.total,
          items: order.items || [],
          source: 'salla',
          reviewSent: false,
        });
        break;
      }

      case 'orders.status_updated': {
        const order = payload.data;
        const orderRef = doc(db, 'orders', order.id.toString());
        await updateDoc(orderRef, { status: order.status });
        break;
      }

      case 'orders.refunded':
      case 'orders.cancelled': {
        const order = payload.data;
        const orderRef = doc(db, 'orders', order.id.toString());
        await updateDoc(orderRef, { status: 'cancelled' });
        break;
      }

      default:
        console.log('❌ حدث غير مدعوم حالياً:', event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SALLA Webhook ERROR]', error);
    return res.status(500).json({ message: 'Webhook handling error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const event = req.headers['x-salla-event'] as string;
  const signature = req.headers['x-salla-signature'] as string;
  const payload = JSON.stringify(req.body);

  console.log('🔄 Salla Webhook received:', {
    event,
    signature: signature ? 'present' : 'missing',
    payload: req.body,
  });

  // Verify webhook signature if secret is configured
  if (process.env.SALLA_WEBHOOK_SECRET && signature) {
    if (!verifyWebhookSignature(payload, signature, process.env.SALLA_WEBHOOK_SECRET)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ message: 'Invalid signature' });
    }
  }

  try {
    switch (event) {
      case 'app.store.authorize': {
        const { store_id, access_token, refresh_token, expires_in } = req.body.data;

        console.log('✅ Store authorization received:', { store_id });

        if (!store_id || !access_token || !refresh_token) {
          console.error('❌ Missing required authorization data');
          break;
        }

        // Find the store document by searching for matching store_id
        const storesQuery = query(
          collection(db, 'stores'),
          where('salla.store_id', '==', store_id.toString())
        );
        
        const storesSnapshot = await getDocs(storesQuery);
        
        if (!storesSnapshot.empty) {
          // Update existing store
          const storeDoc = storesSnapshot.docs[0];
          await updateDoc(storeDoc.ref, {
            'salla.access_token': access_token,
            'salla.refresh_token': refresh_token,
            'salla.expires_in': expires_in,
            'salla.connected_at': new Date().toISOString(),
            'salla.connected': true,
            sallaConnected: true,
          });
          console.log('✅ Updated existing store authorization:', storeDoc.id);
        } else {
          // Create new store document if not found
          await setDoc(doc(db, 'stores', store_id.toString()), {
            salla: {
              store_id: store_id.toString(),
              access_token,
              refresh_token,
              expires_in,
              connected_at: new Date().toISOString(),
              connected: true,
            },
            sallaConnected: true,
            createdAt: new Date().toISOString(),
          });
          console.log('✅ Created new store document:', store_id);
        }
        break;
      }

      case 'orders.create': {
        const order = req.body.data;
        const storeId = req.body.store_id;

        if (!storeId || !order) {
          console.error('❌ Missing order or store data');
          break;
        }

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

        console.log('✅ Order created:', order.id);
        break;
      }

      case 'orders.status_updated': {
        const order = req.body.data;
        if (order?.id) {
          const orderRef = doc(db, 'orders', order.id.toString());
          await updateDoc(orderRef, { 
            status: order.status,
            updatedAt: new Date().toISOString(),
          });
          console.log('✅ Order status updated:', order.id, order.status);
        }
        break;
      }

      case 'orders.refunded':
      case 'orders.cancelled': {
        const order = req.body.data;
        if (order?.id) {
          const orderRef = doc(db, 'orders', order.id.toString());
          await updateDoc(orderRef, { 
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          });
          console.log('✅ Order cancelled/refunded:', order.id);
        }
        break;
      }

      default:
        console.log('ℹ️ Unhandled event:', event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Webhook handling error:', error);
    return res.status(500).json({ message: 'Webhook handling error' });
  }
}
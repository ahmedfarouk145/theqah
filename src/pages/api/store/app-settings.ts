import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { verifyUser } from '@/utils/verifyUser';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { uid } = await verifyUser(req);
    const storeRef = doc(db, 'stores', uid);
    const snap = await getDoc(storeRef);
    const app = snap.exists() ? snap.data().app || {} : {};

    if (req.method === 'GET') {
      return res.status(200).json({ app });
    }

    if (req.method === 'POST') {
      const {
        sender_name,
        default_send_method,
        sms_template,
        whatsapp_template,
        email_template,
      } = req.body;

      await setDoc(storeRef, {
        app: {
          sender_name,
          default_send_method,
          sms_template,
          whatsapp_template,
          email_template,
        },
      }, { merge: true });

      return res.status(200).json({ message: 'تم الحفظ', app: req.body });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (err) {
    console.error('App-settings API error:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

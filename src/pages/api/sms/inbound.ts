import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method!=='POST') return res.status(405).end();
  const { from, body, secret } = req.body || {};
  if (secret !== process.env.OURSMS_INBOUND_SECRET) return res.status(401).end();

  if ((body || '').toString().trim().toUpperCase() === 'STOP') {
    const p = (from || '').replace(/[^\d]/g,'');
    await dbAdmin().collection('optouts_sms').doc(p).set({ createdAt: Date.now() }, { merge:true });
  }
  res.status(200).json({ ok:true });
}

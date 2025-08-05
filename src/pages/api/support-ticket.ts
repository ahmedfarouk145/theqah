// src/pages/api/support-ticket.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { admin, initAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  try {
    initAdmin(); // تأكد من تهيئة Firebase Admin
    const db = admin.firestore();

    await db.collection('support_tickets').add({
      name,
      email,
      message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    return res.status(200).json({ message: 'Ticket submitted successfully' });
  } catch (error) {
    console.error('Error saving ticket:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

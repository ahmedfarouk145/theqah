// src/utils/verifyAdmin.ts
import { NextApiRequest } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { initAdmin } from '@/lib/firebaseAdmin';

initAdmin();

export async function verifyAdmin(req: NextApiRequest) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing token');
  }

  const token = authHeader.split(' ')[1];
  const decodedToken = await getAuth().verifyIdToken(token);

  // تأكد أن البريد يطابق بريد الأدمن فقط (قابل للتعديل لاحقًا لدعم صلاحيات متعددة)
  const adminEmail = process.env.ADMIN_EMAIL;
  if (decodedToken.email !== adminEmail) {
    throw new Error('Unauthorized: Not admin');
  }

  return decodedToken;
}

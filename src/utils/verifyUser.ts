// File: src/utils/verifyUser.ts
import { admin } from '@/lib/firebaseAdmin';
import { NextApiRequest } from 'next';

export async function verifyUser(req: NextApiRequest) {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    throw new Error('Unauthorized: Missing token');
  }

  const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}

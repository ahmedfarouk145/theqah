// src/utils/getAuthFromRequest.ts
import { getAuth } from 'firebase-admin/auth';
import { admin } from '@/lib/firebaseAdmin';
import { NextApiRequest } from 'next';

export async function getAuthFromRequest(req: NextApiRequest) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing Bearer token');
  }

  const token = authHeader.split('Bearer ')[1];
const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid };
}

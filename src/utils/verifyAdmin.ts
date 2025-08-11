// src/utils/verifyAdmin.ts
import { NextApiRequest } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from '@/lib/firebaseAdmin';

initAdmin();

export async function verifyAdmin(req: NextApiRequest) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing token');
  }

  const token = authHeader.split(' ')[1];
  const decodedToken = await getAuth().verifyIdToken(token);

  // قراءة الدور من Firestore
  const userRef = getFirestore().collection('users').doc(decodedToken.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new Error('Unauthorized: User not found');
  }

  const role = userSnap.data()?.role;
  if (role !== 'admin') {
    throw new Error('Unauthorized: Not admin');
  }

  return decodedToken;
}

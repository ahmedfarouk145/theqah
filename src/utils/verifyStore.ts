import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { initAdmin } from '@/lib/firebaseAdmin';

initAdmin();

interface StoreRequest extends NextApiRequest {
  storeId: string;
  storeEmail?: string; // ✅ جعلها اختيارية
}

export async function verifyStore(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await getAuth().verifyIdToken(token);

    const storeReq = req as StoreRequest;
    storeReq.storeId = decodedToken.uid;
    storeReq.storeEmail = decodedToken.email ?? ''; // أو اجعلها اختيارية كما في الواجهة

    return null; // All good
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
}

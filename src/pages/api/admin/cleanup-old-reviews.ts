import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/server/firebase-admin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Security: Only allow POST requests with CRON_SECRET
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    const storeUid = 'salla:982747175';
    
    // Get all reviews for the store
    const reviewsSnapshot = await db
      .collection('reviews')
      .where('storeUid', '==', storeUid)
      .get();

    const toDelete: string[] = [];
    const toUpdate: Array<{ id: string; data: object }> = [];
    
    reviewsSnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Delete reviews without productId or orderId (synced reviews)
      if (!data.productId || !data.orderId) {
        toDelete.push(doc.id);
      }
      // Update webhook reviews that still have needsSallaId flag
      else if (data.needsSallaId === true) {
        toUpdate.push({
          id: doc.id,
          data: {
            needsSallaId: true,
            cleanedAt: new Date().toISOString(),
          }
        });
      }
    });

    // Batch delete synced reviews
    const deleteBatch = db.batch();
    toDelete.forEach((docId) => {
      deleteBatch.delete(db.collection('reviews').doc(docId));
    });
    await deleteBatch.commit();

    // Batch update webhook reviews (ensure flag is set)
    if (toUpdate.length > 0) {
      const updateBatch = db.batch();
      toUpdate.forEach(({ id, data }) => {
        updateBatch.update(db.collection('reviews').doc(id), data);
      });
      await updateBatch.commit();
    }

    return res.status(200).json({
      success: true,
      deleted: toDelete.length,
      updated: toUpdate.length,
      deletedIds: toDelete,
      updatedIds: toUpdate.map(u => u.id),
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

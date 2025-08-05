// src/pages/api/get-reviews.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

type Review = {
  stars: number;
  comment?: string;
  name?: string;
  orderId?: string;
  productId?: string;
  createdAt?: string;
  trustedBuyer?: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { storeName, productId } = req.query;

  if (!storeName || typeof storeName !== 'string') {
    return res.status(400).json({ message: 'Store name is required' });
  }

  try {
    const reviewsRef = collection(db, 'reviews');
    const filters = [
      where('storeName', '==', storeName),
      where('published', '==', true),
    ];

    if (productId && typeof productId === 'string') {
      filters.push(where('productId', '==', productId));
    }

    const q = query(reviewsRef, ...filters);
    const snapshot = await getDocs(q);

    const reviews: Review[] = snapshot.docs.map((doc) => doc.data() as Review);

    const average =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length
        : 0;

    res.status(200).json({
      reviews,
      total: reviews.length,
      average: Math.round(average * 10) / 10,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

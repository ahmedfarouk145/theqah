'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

type Review = {
  id: string;
  name?: string;
  stars: number;
  comment?: string;
  createdAt?: string;
  published: boolean;
};

export default function ReviewsTab({ storeName }: { storeName: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    try {
      const res = await axios.get('/api/get-reviews', {
        params: { storeName },
      });
      setReviews(res.data.reviews || []);
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [storeName]);

  if (loading) return <p>جاري تحميل التقييمات…</p>;
  if (reviews.length === 0) return <p>لا توجد تقييمات حالياً.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-right border rounded-lg overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2">الاسم</th>
            <th className="px-4 py-2">النجوم</th>
            <th className="px-4 py-2">التعليق</th>
            <th className="px-4 py-2">تاريخ</th>
            <th className="px-4 py-2">الحالة</th>
            <th className="px-4 py-2">إجراء</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-2">{r.name || 'مستخدم'}</td>
              <td className="px-4 py-2 text-yellow-500">{'⭐'.repeat(r.stars)}</td>
              <td className="px-4 py-2 max-w-xs truncate">{r.comment || '-'}</td>
              <td className="px-4 py-2">
                {r.createdAt
                  ? format(new Date(r.createdAt), 'dd MMM yyyy', { locale: arSA })
                  : '-'}
              </td>
              <td className="px-4 py-2">
                {r.published ? (
                  <span className="text-green-600">معروضة</span>
                ) : (
                  <span className="text-gray-500">مخفية</span>
                )}
              </td>
             
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

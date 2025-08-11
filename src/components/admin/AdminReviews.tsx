'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/axiosInstance';

interface Review {
  id: string;
  name: string;
  comment: string;
  stars: number;
  storeName: string;
  published: boolean;
  createdAt?: string | Date;
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/reviews');
      setReviews(res.data.reviews);
    } catch (error) {
      console.error('Failed to load reviews', error);
      setError('حدث خطأ أثناء تحميل التقييمات');
    } finally {
      setLoading(false);
    }
  };

  const togglePublish = async (id: string, current: boolean) => {
    try {
      await axios.patch(`/api/admin/reviews/${id}`, {
        published: !current,
      });
      fetchReviews(); // تحديث البيانات
    } catch {
      alert('فشل في تحديث حالة التقييم');
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold text-green-800 mb-4">📝 مراجعة التقييمات</h2>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="border p-4 rounded-lg shadow-sm bg-white space-y-1"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-green-700">
                  ⭐ {r.stars} – {r.name} ({r.storeName})
                </h3>
                <button
                  onClick={() => togglePublish(r.id, r.published)}
                  className={`text-sm px-3 py-1 rounded-full ${
                    r.published
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {r.published ? 'إخفاء' : 'نشر'}
                </button>
              </div>
              <p className="text-sm text-gray-700">{r.comment || 'بدون تعليق'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

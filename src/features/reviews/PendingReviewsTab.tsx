// src/features/reviews/PendingReviewsTab.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import axios from '@/lib/axiosInstance';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { CheckCircle, XCircle, Clock, Star } from 'lucide-react';

type PendingReview = {
  id: string;
  stars: number;
  text?: string;
  createdAt?: number;
  status?: string;
  productId?: string;
  author?: {
    displayName?: string;
  };
};

export default function PendingReviewsTab() {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchPendingReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      
      if (!user) {
        setError('يرجى تسجيل الدخول أولاً');
        return;
      }

      const token = await user.getIdToken();
      const response = await axios.get('/api/reviews', {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'pending' },
      });

      setReviews(response.data.reviews || []);
    } catch (err) {
      console.error('Error fetching pending reviews:', err);
      setError('فشل في تحميل التقييمات المعلقة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingReviews();
  }, [fetchPendingReviews]);

  const handleUpdateStatus = async (reviewId: string, status: 'approved' | 'rejected') => {
    setProcessing(reviewId);
    setError(null);

    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      
      if (!user) {
        setError('يرجى تسجيل الدخول أولاً');
        return;
      }

      const token = await user.getIdToken();
      await axios.post(
        '/api/reviews/update-status',
        { reviewId, status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Refresh the list
      await fetchPendingReviews();
    } catch (err) {
      console.error('Error updating review status:', err);
      setError('فشل في تحديث حالة التقييم');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'غير محدد';
    try {
      return format(new Date(timestamp), 'dd MMM yyyy, HH:mm', { locale: arSA });
    } catch {
      return 'تاريخ غير صالح';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchPendingReviews}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-12 text-center">
        <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-700 mb-2">لا توجد تقييمات معلقة</h3>
        <p className="text-gray-500">جميع التقييمات تم مراجعتها</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">التقييمات المعلقة</h2>
        <p className="opacity-90">يوجد {reviews.length} تقييم ينتظر مراجعتك</p>
      </div>

      <div className="grid gap-4">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= (review.stars || 0)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="font-bold text-lg">{review.stars}/5</span>
                </div>
                <p className="text-sm text-gray-500 mb-2">
                  {review.author?.displayName || 'عميل المتجر'} • {formatDate(review.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus(review.id, 'approved')}
                  disabled={processing === review.id}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  اعتماد
                </button>
                <button
                  onClick={() => handleUpdateStatus(review.id, 'rejected')}
                  disabled={processing === review.id}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  رفض
                </button>
              </div>
            </div>
            {review.text && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 leading-relaxed">{review.text}</p>
              </div>
            )}
            {processing === review.id && (
              <div className="mt-4 flex items-center gap-2 text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm">جاري المعالجة...</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

interface Review {
  name?: string;
  stars: number;
  comment?: string;
  createdAt?: string;
}

export default function ReviewsPage() {
  const router = useRouter();
  const { storeName, productId } = router.query;

  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!storeName) return;

    axios
      .get('/api/get-reviews', { params: { storeName, productId } })
      .then((res) => {
        setReviews(res.data.reviews || []);
        setAverage(res.data.average || 0);
        setTotal(res.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [storeName, productId]);

  if (!storeName) return <div className="p-6 text-red-600">⚠️ يرجى تحديد المتجر</div>;
  if (loading) return <div className="p-6 text-gray-500">⏳ جارٍ التحميل...</div>;

  return (
    <main className="min-h-screen bg-gradient-to-br from-black to-[#0f1f1a] text-white font-sans relative overflow-hidden">
      {/* خلفية مرسومة بسيطة */}
      <div className="absolute inset-0 bg-[radial-gradient(#1f2f2a_1px,transparent_1px)] [background-size:20px_20px] opacity-10 z-0" />

      {/* الترويسة */}
      <motion.header
        className="relative z-10 text-center py-14"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      >
        <h1 className="text-4xl md:text-5xl font-bold text-[#39FF14] tracking-wide drop-shadow">
          تقييمات <span className="text-white">{storeName}</span>
        </h1>
        <p className="mt-4 text-lg text-[#0ABAB5]">
          ⭐ متوسط: <strong>{average.toFixed(1)}</strong> من 5 ({total} تقييم)
        </p>
      </motion.header>

      {/* محتوى التقييمات */}
      <section className="relative z-10 max-w-3xl mx-auto p-6 space-y-8">
        {reviews.length === 0 ? (
          <motion.p
            className="text-center text-gray-400"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            لا توجد تقييمات بعد.
          </motion.p>
        ) : (
          reviews.map((r, i) => (
            <motion.div
              key={i}
              className="bg-[#111] border border-[#1d3a31] rounded-xl p-6 shadow-xl hover:shadow-green-700/30 transition duration-300"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.2, duration: 0.6 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-5 h-5 ${idx < r.stars ? 'text-yellow-400' : 'text-gray-600'}`}
                      fill={idx < r.stars ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>
                {r.name && <span className="text-sm text-gray-400">— {r.name}</span>}
              </div>
              {r.comment && <p className="text-gray-100 mt-2 leading-relaxed">{r.comment}</p>}
              {r.createdAt && (
                <p className="text-xs text-gray-500 mt-3">
                  {new Date(r.createdAt).toLocaleDateString('ar-EG')}
                </p>
              )}
            </motion.div>
          ))
        )}
      </section>
    </main>
  );
}

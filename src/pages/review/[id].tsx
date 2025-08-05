'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios, { AxiosError } from 'axios';
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';

type OrderType = {
  orderId: string;
};

export default function ReviewPage() {
  const router = useRouter();
  const { id, thankyou } = router.query;

  const [order, setOrder] = useState<OrderType | null>(null);
  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    const fetchOrder = async () => {
      try {
        const res = await axios.get(`/api/get-order?id=${id}`);
        setOrder(res.data);
      } catch (err: unknown) {
        const axiosError = err as AxiosError<{ message?: string }>;
        setError(axiosError.response?.data?.message || 'حدث خطأ أثناء تحميل البيانات.');
      }
    };

    fetchOrder();
  }, [id]);

  const submitReview = async () => {
    if (!id || typeof id !== 'string') return;

    setError('');
    if (stars < 1) return setError('يرجى اختيار عدد النجوم أولاً.');

    setLoading(true);
    try {
      await axios.post('/api/submit-review', { orderId: id, stars, comment });
      router.replace(`/review/${id}?thankyou=true`);
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'حدث خطأ أثناء الإرسال.');
    } finally {
      setLoading(false);
    }
  };

  if (thankyou === 'true') {
    return (
      <motion.div
        className="flex flex-col items-center justify-center h-screen text-center px-4 bg-gradient-to-b from-green-50 to-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* شعار متحرك */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120, delay: 0.3 }}
          className="mb-6"
        >
          <Image src="/logo.png" alt="شعار ثقة" width={100} height={100} />
        </motion.div>

        <motion.h1
          className="text-4xl font-bold text-green-700 mb-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          شكرًا لتقييمك!
        </motion.h1>
        <motion.p
          className="text-gray-600"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          نحن نقدر رأيك وسنعمل دائمًا على تحسين تجربتك.
        </motion.p>

        <Link
          href="/"
          className="mt-6 text-white bg-green-700 hover:bg-green-800 px-6 py-2 rounded-full transition"
        >
          العودة للرئيسية
        </Link>
      </motion.div>
    );
  }

  return (
    <main className="min-h-screen bg-white py-16 px-6 text-center overflow-hidden relative">
      <motion.div
        className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-green-50 to-white opacity-30 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />
      <div className="max-w-xl mx-auto relative z-10">
        {/* لوجو ثقة في أعلى الصفحة */}
        <motion.div
          className="mb-8 flex justify-center"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <Image src="/logo.png" alt="شعار ثقة" width={80} height={80} />
        </motion.div>

        <motion.h1
          className="text-3xl font-bold mb-4 text-green-800"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          قيّم تجربتك معنا
        </motion.h1>

        {order && (
          <motion.p
            className="text-gray-700 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            طلب رقم: {order.orderId}
          </motion.p>
        )}

        <motion.div
          className="flex justify-center gap-2 my-6"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } },
            hidden: {},
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              variants={{
                visible: { opacity: 1, y: 0 },
                hidden: { opacity: 0, y: 20 },
              }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Star
                onClick={() => setStars(i)}
                className={cn(
                  'w-10 h-10 cursor-pointer transition-colors',
                  i <= stars ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-400'
                )}
              />
            </motion.div>
          ))}
        </motion.div>

        <motion.textarea
          rows={4}
          className="w-full border border-gray-300 rounded-md p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
          placeholder="اكتب تعليقك هنا (اختياري)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        />

        {error && (
          <motion.p
            className="text-red-600 mb-4 font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {error}
          </motion.p>
        )}

        <motion.button
          onClick={submitReview}
          disabled={loading}
          className="bg-green-700 text-white px-6 py-3 rounded-md hover:bg-green-800 transition disabled:opacity-50 shadow-lg"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {loading ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
        </motion.button>
      </div>
    </main>
  );
}

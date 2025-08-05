'use client';

import { useState } from 'react';
import NavbarLanding from '@/components/NavbarLanding';
import { motion } from 'framer-motion';

export default function ReportPage() {
  const [form, setForm] = useState({
    reviewId: '',
    name: '',
    email: '',
    reason: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch('/api/report-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setForm({ reviewId: '', name: '', email: '', reason: '' });
      } else {
        setError(data.message || 'حدث خطأ أثناء الإرسال');
      }
    } catch {
      setError('تعذر الاتصال بالخادم، حاول لاحقاً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-white text-[#0e1e1a] font-sans min-h-screen overflow-x-hidden">
      <NavbarLanding />
      <div className="h-20" />

      <section className="bg-gradient-to-b from-green-50 to-white py-16 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-4xl font-extrabold text-green-900"
        >
          الإبلاغ عن تقييم مسيء
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mt-4 text-gray-600"
        >
          إذا واجهت تقييمًا غير لائق، يمكنك إبلاغنا عبر النموذج التالي
        </motion.p>
      </section>

      <section className="max-w-xl mx-auto px-6 py-10">
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="bg-green-50 p-6 rounded-xl shadow space-y-4"
        >
          <input
            type="text"
            name="reviewId"
            placeholder="معرف التقييم (Review ID)"
            className="w-full border border-green-200 rounded-lg p-3"
            value={form.reviewId}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="name"
            placeholder="اسمك"
            className="w-full border border-green-200 rounded-lg p-3"
            value={form.name}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            placeholder="بريدك الإلكتروني"
            className="w-full border border-green-200 rounded-lg p-3"
            value={form.email}
            onChange={handleChange}
            required
          />
          <textarea
            name="reason"
            placeholder="سبب الإبلاغ"
            rows={4}
            className="w-full border border-green-200 rounded-lg p-3"
            value={form.reason}
            onChange={handleChange}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-green-700 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            {loading ? 'جارٍ الإرسال...' : 'إرسال البلاغ'}
          </button>

          {success && <p className="text-green-600 mt-3">✅ تم إرسال البلاغ بنجاح، شكرًا لك.</p>}
          {error && <p className="text-red-600 mt-3">❌ {error}</p>}
        </motion.form>
      </section>
    </main>
  );
}

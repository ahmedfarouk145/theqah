'use client';

import { useState } from 'react';
import NavbarLanding from '@/components/NavbarLanding';
import axios from 'axios';

export default function SupportPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      await axios.post('/api/support-ticket', form);
      setForm({ name: '', email: '', message: '' });
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const faqs = [
    {
      q: 'كيف يمكنني ربط متجري مع مشتري موثق؟',
      a: 'من خلال لوحة التحكم في الإعدادات، اختر "الربط مع المتجر"، واتبع التعليمات.',
    },
    {
      q: 'هل التقييمات تُعرض تلقائيًا؟',
      a: 'نعم، يتم عرض التقييمات تلقائيًا بعد مراجعتها والتأكد من عدم وجود إساءة.',
    },
    {
      q: 'كيف أتلقى التقييمات؟',
      a: 'يتم إرسال رابط التقييم تلقائيًا بعد الشراء عبر واتساب أو SMS أو بريد إلكتروني.',
    },
  ];

  return (
    <main className="bg-white text-[#0e1e1a] font-sans min-h-screen overflow-x-hidden">
      <NavbarLanding />
      <div className="h-20" />

      {/* Hero Section - CSS animation instead of framer-motion */}
      <section className="py-16 text-center bg-gradient-to-b from-green-50 to-white">
        <h1 className="text-4xl font-extrabold text-green-900 animate-fade-in">
          الدعم والمساعدة
        </h1>
        <p className="mt-4 text-gray-600 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          نحن هنا لخدمتك. إذا كان لديك أي استفسار أو مشكلة، لا تتردد في التواصل معنا.
        </p>
      </section>

      {/* Support Form */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="bg-green-50 p-6 rounded-xl shadow space-y-4 animate-slide-up"
        >
          <h2 className="text-xl font-semibold text-green-700 mb-4">أرسل تذكرة دعم</h2>

          <input
            required
            type="text"
            placeholder="الاسم"
            className="w-full border border-green-200 rounded-lg p-3"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            required
            type="email"
            placeholder="البريد الإلكتروني"
            className="w-full border border-green-200 rounded-lg p-3"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <textarea
            required
            placeholder="رسالتك"
            className="w-full border border-green-200 rounded-lg p-3 h-32"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />

          <button
            type="submit"
            className="bg-green-700 text-white py-3 px-6 rounded-lg hover:bg-green-800 transition"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'جارٍ الإرسال...' : 'إرسال التذكرة'}
          </button>

          {status === 'success' && (
            <p className="text-green-600 mt-2">✅ تم إرسال التذكرة بنجاح. سنتواصل معك قريبًا.</p>
          )}
          {status === 'error' && (
            <p className="text-red-600 mt-2">❌ حدث خطأ أثناء الإرسال. حاول مرة أخرى لاحقًا.</p>
          )}
        </form>
      </section>

      {/* FAQs Section */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-xl font-semibold text-green-700 mb-6 animate-fade-in">
          الأسئلة الشائعة
        </h2>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="bg-gray-50 p-4 rounded-lg border border-gray-200 animate-slide-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <summary className="cursor-pointer font-medium text-green-800">{faq.q}</summary>
              <p className="mt-2 text-gray-700">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

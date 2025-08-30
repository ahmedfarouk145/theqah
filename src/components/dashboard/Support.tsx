'use client';

import { useState } from 'react';

export default function SupportTab() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/support-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      setSent(true);
      setSubject('');
      setMessage('');
    } catch {
      alert('حدث خطأ أثناء إرسال التذكرة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* FAQ */}
      <div>
        <h2 className="text-xl font-semibold text-green-800 mb-4">❓ الأسئلة الشائعة</h2>
        <ul className="space-y-3">
          <li className="border p-3 rounded">
            <strong>كيف أستخدم منصة ثقة؟</strong>
            <p className="text-sm text-gray-600 mt-2">
              قم بربط متجرك، واضبط الرسائل، وسيتم إرسال طلبات التقييم تلقائيًا.
            </p>
          </li>
          <li className="border p-3 rounded">
            <strong>كيف أربط متجري من سلة أو زد؟</strong>
            <p className="text-sm text-gray-600 mt-2">
              من تبويب &quot;الإعدادات&quot; يمكنك الضغط على زر &quot;ربط بـ سلة&quot; أو &quot;زد&quot;.
            </p>
          </li>
        </ul>
      </div>

      {/* Support Ticket */}
      <div>
        <h2 className="text-xl font-semibold text-green-800 mb-4">📨 فتح تذكرة دعم</h2>
        {sent ? (
          <p className="text-green-700 font-medium">
            تم إرسال التذكرة بنجاح! سنرد عليك خلال 24 ساعة.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium">عنوان التذكرة</label>
              <input
                required
                className="w-full mt-1 border rounded px-3 py-2"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">تفاصيل المشكلة</label>
              <textarea
                required
                className="w-full mt-1 border rounded px-3 py-2 min-h-[100px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800"
            >
              {loading ? 'جاري الإرسال...' : 'إرسال التذكرة'}
            </button>
          </form>
        )}
      </div>

      {/* Direct Contact */}
      <div>
        <h2 className="text-xl font-semibold text-green-800 mb-4">📞 تواصل مباشر</h2>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>
            واتساب:{' '}
            <a
              href="https://wa.me/966500000000"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 underline"
            >
              راسلنا عبر واتساب
            </a>
          </li>
          <li>
            بريد الدعم:{' '}
            <a href="mailto:support@theqah.com.sa" className="text-green-700 underline">
              support@theqah.com.sa
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

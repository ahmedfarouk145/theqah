// src/pages/review/[orderId].tsx

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function ReviewPage() {
  const router = useRouter();
  const { orderId } = router.query;

  const [storeName, setStoreName] = useState('');
  const [name, setName] = useState('');
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  // ✅ تحميل بيانات الطلب
  useEffect(() => {
    if (!orderId) return;

    fetch(`/api/get-order?id=${orderId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.storeName) {
          setStoreName(data.storeName);
          setName(data.name);
        }
        setLoading(false);
      });
  }, [orderId]);

  // ✅ إرسال التقييم
  const handleSubmit = async () => {
    const res = await fetch('/api/submit-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, stars, comment }),
    });

    if (res.ok) setSubmitted(true);
  };

  if (loading) return <div className="p-4 text-center">جاري التحميل...</div>;

  if (submitted) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-lg mb-2">شكراً يا {name} على تقييمك 🙏</h2>
        <p>تم نشر تقييمك كمشتري ثقة 💚</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-xl mb-4 text-center">تقييمك لمتجر {storeName}</h1>

      <div className="flex justify-center mb-4">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setStars(n)} className="text-2xl">
            <span className={n <= stars ? 'text-yellow-500' : 'text-gray-400'}>★</span>
          </button>
        ))}
      </div>

      <textarea
        placeholder="اكتب رأيك هنا"
        className="w-full p-2 border rounded mb-4"
        value={comment}
        onChange={e => setComment(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        className="bg-green-600 text-white w-full py-2 rounded"
      >
        إرسال التقييم
      </button>
    </div>
  );
}

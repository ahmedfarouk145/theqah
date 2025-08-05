// src/pages/api/submit-review.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeComment(comment: string): Promise<{
  abusive: boolean;
  lang: 'ar' | 'en';
}> {
  const prompt = `حلل التعليق التالي من ناحيتين:

1. هل يحتوي على أي شتائم أو كلمات مسيئة أو مهينة أو غير لائقة؟ جاوب بـ "نعم" أو "لا".
2. ما هي لغة التعليق؟ فقط جاوب بكود ISO 639-1 مثل: "ar" أو "en".

التعليق:
"${comment}"

الرد يجب أن يكون بهذا الشكل فقط:
إساءة: نعم أو لا
لغة: ar أو en`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message.content?.toLowerCase() || '';
  const abusive = content.includes('إساءة: نعم');
  const lang = content.includes('لغة: ar') ? 'ar' : 'en';

  return { abusive, lang };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { orderId, stars, comment } = req.body;

  if (!orderId || !stars || typeof stars !== 'number') {
    return res.status(400).json({ message: 'Missing or invalid fields' });
  }

  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const orderData = orderSnap.data();
    const productId = orderData.productId || null;

    const { abusive, lang } = comment
      ? await analyzeComment(comment)
      : { abusive: false, lang: 'ar' };

    if (abusive) {
      const errorMessage =
        lang === 'ar'
          ? 'تعليقك يحتوي على ألفاظ غير لائقة. نرجو التعديل بأسلوب نقد محترم.'
          : 'Your comment contains inappropriate language. Please rephrase it politely.';

      return res.status(400).json({ message: errorMessage });
    }

    await addDoc(collection(db, 'reviews'), {
      orderId,
      productId,
      storeName: orderData.storeName,
      name: orderData.name,
      stars,
      comment: comment || '',
      createdAt: new Date().toISOString(),
      published: true,
      trustedBuyer: true,
    });

    const responseMsg =
      lang === 'ar' ? 'تم نشر التقييم بنجاح' : 'Review submitted successfully';

    return res.status(200).json({ message: responseMsg });
  } catch (error) {
    console.error('Review Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
}

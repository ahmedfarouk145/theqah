// src/pages/api/admin/reviews/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

function sanitizeText(s: string) {
  return s.replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, '').trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await verifyAdmin(req);

    const { id } = req.query;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ message: 'معرف التقييم مطلوب وصحيح', error: 'Invalid Review ID' });
    }
    const reviewId = id.trim();

    const db = dbAdmin();
    const reviewRef = db.collection('reviews').doc(reviewId);
    const reviewDoc = await reviewRef.get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ message: 'التقييم غير موجود', error: 'Not Found' });
    }
    const reviewData = reviewDoc.data() || {};

    if (req.method === 'GET') {
      const data = {
        id: reviewId,
        name: reviewData.name ?? 'مجهول',
        comment: reviewData.comment ?? '',
        stars: reviewData.stars ?? 0,
        storeName: reviewData.storeName ?? 'غير محدد',
        published: Boolean(reviewData.published),
        createdAt: reviewData.createdAt?.toDate?.()?.toISOString?.() || reviewData.createdAt,
        lastModified: reviewData.lastModified?.toDate?.()?.toISOString?.() || reviewData.lastModified,
        moderatorNote: reviewData.moderatorNote,
      };
      return res.status(200).json({ id: reviewId, message: 'تم استرجاع التقييم بنجاح', review: data });
    }

    if (req.method === 'PATCH') {
      const { published, moderatorNote } = req.body || {};
      if (published !== undefined && typeof published !== 'boolean') {
        return res.status(400).json({ message: 'قيمة النشر يجب أن تكون true أو false', error: 'Invalid Published' });
      }
      if (moderatorNote !== undefined && typeof moderatorNote !== 'string') {
        return res.status(400).json({ message: 'ملاحظة المشرف يجب أن تكون نص', error: 'Invalid Note' });
      }
      if (moderatorNote && moderatorNote.length > 2000) {
        return res.status(400).json({ message: 'ملاحظة المشرف طويلة جداً', error: 'Note Too Long' });
      }

      const updateData: Record<string, unknown> = { lastModified: new Date() };
      if (published !== undefined) updateData.published = published;
      if (moderatorNote !== undefined) updateData.moderatorNote = sanitizeText(moderatorNote);

      await reviewRef.update(updateData);

      try {
        await db.collection('admin_audit_logs').add({
          action: 'updateReview',
          reviewId,
          changes: updateData,
          createdAt: new Date(),
        });
      } catch (e) {
        console.error('Audit log failed', e);
      }

      const updated = (await reviewRef.get()).data() || {};
      return res.status(200).json({
        id: reviewId,
        message: published !== undefined
          ? (published ? 'تم نشر التقييم بنجاح' : 'تم إخفاء التقييم بنجاح')
          : 'تم تحديث التقييم بنجاح',
        review: {
          id: reviewId,
          name: updated.name ?? reviewData.name ?? 'مجهول',
          comment: updated.comment ?? reviewData.comment ?? '',
          stars: updated.stars ?? reviewData.stars ?? 0,
          storeName: updated.storeName ?? reviewData.storeName ?? 'غير محدد',
          published: updated.published ?? reviewData.published ?? false,
          createdAt:
            (updated.createdAt || reviewData.createdAt)?.toDate?.()?.toISOString?.() ||
            updated.createdAt || reviewData.createdAt,
          lastModified:
            (updated.lastModified as Date)?.toISOString?.() ||
            new Date().toISOString(),
          moderatorNote: updated.moderatorNote ?? reviewData.moderatorNote,
        }
      });
    }

    if (req.method === 'DELETE') {
      const { confirm, reason } = req.body || {};
      if (confirm !== true || !reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'تأكيد الحذف وسبب مطلوبان', error: 'Confirmation Required' });
      }

      await reviewRef.delete();

      try {
        await db.collection('admin_audit_logs').add({
          action: 'deleteReview',
          reviewId,
          reason: sanitizeText(reason),
          metadata: {
            storeName: reviewData?.storeName,
            stars: reviewData?.stars,
            published: reviewData?.published,
          },
          createdAt: new Date(),
        });
      } catch (e) {
        console.error('Audit log failed', e);
      }

      return res.status(200).json({ id: reviewId, message: 'تم حذف التقييم بنجاح' });
    }

    return res.status(405).json({ message: 'الطريقة غير مدعومة', error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Review API error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    if (msg.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    }
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}

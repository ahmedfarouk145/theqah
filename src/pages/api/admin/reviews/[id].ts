// src/pages/api/admin/reviews/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { mapReview } from '@/utils/mapReview';

function sanitizeText(s: string) {
  return s.replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, '').trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    const { id } = req.query;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ message: 'معرف التقييم مطلوب وصحيح', error: 'Invalid Review ID' });
    }
    const reviewId = id.trim();

    const db = dbAdmin();
    const reviewRef = db.collection('reviews').doc(reviewId);
    const snap = await reviewRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'التقييم غير موجود', error: 'Not Found' });
    const d = snap.data() || {};

    // lookup storeName
    let storeName = 'غير محدد';
    if (d?.storeUid) {
      let sDoc = await db.collection('stores').doc(d.storeUid).get();
      if (!sDoc.exists) {
        const qs = await db.collection('stores').where('uid', '==', d.storeUid).limit(1).get();
        sDoc = qs.docs[0];
      }
      const s = sDoc?.data() || {};
      storeName = s?.salla?.storeName || s?.zid?.storeName || s?.storeName || 'غير محدد';
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        id: reviewId,
        message: 'تم استرجاع التقييم بنجاح',
        review: mapReview(reviewId, d, storeName),
      });
    }

    if (req.method === 'PATCH') {
      const { published, moderatorNote, status } = req.body || {};
      if (published !== undefined && typeof published !== 'boolean') {
        return res.status(400).json({ message: 'قيمة النشر يجب أن تكون true أو false', error: 'Invalid Published' });
      }
      if (moderatorNote !== undefined && typeof moderatorNote !== 'string') {
        return res.status(400).json({ message: 'ملاحظة المشرف يجب أن تكون نص', error: 'Invalid Note' });
      }
      if (moderatorNote && moderatorNote.length > 2000) {
        return res.status(400).json({ message: 'ملاحظة المشرف طويلة جداً', error: 'Note Too Long' });
      }
      if (status !== undefined && typeof status !== 'string') {
        return res.status(400).json({ message: 'قيمة الحالة غير صحيحة', error: 'Invalid Status' });
      }

      const now = Date.now();
      const updateData: Record<string, unknown> = { lastModified: new Date(now) };

      if (published !== undefined) {
        updateData.published = published;
        updateData.status = published
          ? 'published'
          : (d.status === 'published' ? 'hidden' : d.status || 'pending');
        if (published) updateData.publishedAt = now;
      }
      if (status !== undefined) {
        updateData.status = String(status);
        if (String(status) === 'published') {
          updateData.published = true;
          updateData.publishedAt = now;
        }
        if (String(status) === 'hidden') {
          updateData.published = false;
        }
      }
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
        message:
          published !== undefined
            ? (published ? 'تم نشر التقييم بنجاح' : 'تم إخفاء التقييم بنجاح')
            : 'تم تحديث التقييم بنجاح',
        review: mapReview(reviewId, updated, storeName),
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
          createdAt: new Date(),
        });
      } catch (e) {
        console.error('Audit log failed', e);
      }

      return res.status(200).json({ id: reviewId, message: 'تم حذف التقييم بنجاح' });
    }

    return res.status(405).json({ message: 'الطريقة غير مدعومة', error: 'Method Not Allowed' });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Review API error:', error);
    const msg = error?.message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}

// src/pages/api/admin/reviews/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { AdminService } from '@/server/services/admin.service';
import { mapReview } from '@/utils/mapReview';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    const { id } = req.query;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ message: 'معرف التقييم مطلوب وصحيح', error: 'Invalid Review ID' });
    }
    const reviewId = id.trim();

    const adminService = new AdminService();
    const result = await adminService.getReviewWithStore(reviewId);

    if (!result) {
      return res.status(404).json({ message: 'التقييم غير موجود', error: 'Not Found' });
    }

    const { review, storeName } = result;

    if (req.method === 'GET') {
      return res.status(200).json({
        id: reviewId,
        message: 'تم استرجاع التقييم بنجاح',
        review: mapReview(reviewId, review, storeName),
      });
    }

    if (req.method === 'PATCH') {
      const { published, moderatorNote, status } = req.body || {};

      if (published !== undefined && typeof published !== 'boolean') {
        return res.status(400).json({ message: 'قيمة النشر يجب أن تكون true أو false' });
      }
      if (moderatorNote !== undefined && typeof moderatorNote !== 'string') {
        return res.status(400).json({ message: 'ملاحظة المشرف يجب أن تكون نص' });
      }
      if (moderatorNote && moderatorNote.length > 2000) {
        return res.status(400).json({ message: 'ملاحظة المشرف طويلة جداً' });
      }

      await adminService.updateReview(reviewId, { published, status, moderatorNote });

      const updated = await adminService.getReviewWithStore(reviewId);
      return res.status(200).json({
        id: reviewId,
        message: published !== undefined ? (published ? 'تم نشر التقييم بنجاح' : 'تم إخفاء التقييم بنجاح') : 'تم تحديث التقييم بنجاح',
        review: mapReview(reviewId, updated?.review || {}, storeName),
      });
    }

    if (req.method === 'DELETE') {
      const { confirm, reason } = req.body || {};
      if (confirm !== true || !reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'تأكيد الحذف وسبب مطلوبان' });
      }

      await adminService.deleteReview(reviewId, reason);
      return res.status(200).json({ id: reviewId, message: 'تم حذف التقييم بنجاح' });
    }

    return res.status(405).json({ message: 'الطريقة غير مدعومة' });
  } catch (error) {
    console.error('Review API error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'غير مصرح' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'ليس لديك صلاحية' });
    return res.status(500).json({ message: 'خطأ داخلي في الخادم' });
  }
}

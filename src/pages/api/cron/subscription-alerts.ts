// src/pages/api/cron/subscription-alerts.ts
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * M14: Subscription Expiry Alerts
 * Cron job to notify stores about expiring subscriptions
 * Should be called daily via Vercel Cron or external scheduler
 */

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow GET (Vercel cron) and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { dbAdmin } = await import('@/lib/firebaseAdmin');
    const db = dbAdmin();

    const now = Date.now();
    const sevenDaysFromNow = now + (7 * 24 * 60 * 60 * 1000);

    // Find stores with subscriptions expiring in 7 days or less
    const storesSnap = await db.collection('stores')
      .where('subscription.expiresAt', '<=', sevenDaysFromNow)
      .where('subscription.expiresAt', '>', now)
      .get();

    const results = {
      checked: storesSnap.size,
      notified: 0,
      errors: 0,
      details: [] as Array<{ storeUid: string; daysLeft: number; notified: boolean }>,
    };

    for (const doc of storesSnap.docs) {
      const store = doc.data();
      const storeUid = doc.id;
      const expiresAt = store.subscription?.expiresAt || 0;
      const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

      // Get owner info
      const ownerSnap = await db.collection('owners').doc(storeUid).get();
      const owner = ownerSnap.data();

      if (!owner) {
        results.details.push({ storeUid, daysLeft, notified: false });
        continue;
      }

      const email = owner.email || store.merchant?.email;
      const phone = owner.phone || store.merchant?.phone;
      const storeName = store.merchant?.name || store.salla?.storeName || 'متجرك';

      // Check if already notified for this period
      const alertKey = `subscription_alert_${daysLeft <= 3 ? '3day' : '7day'}`;
      const lastAlert = store.alerts?.[alertKey];

      if (lastAlert && (now - lastAlert) < (24 * 60 * 60 * 1000)) {
        // Already notified within 24 hours
        results.details.push({ storeUid, daysLeft, notified: false });
        continue;
      }

      // Send notifications
      try {
        const tasks: Promise<unknown>[] = [];

        // Email notification
        if (email) {
          const { sendEmailDmail } = await import('@/server/messaging/email-dmail');
          const subject = daysLeft <= 3
            ? `⚠️ اشتراك ${storeName} ينتهي خلال ${daysLeft} أيام!`
            : `📅 تذكير: اشتراك ${storeName} ينتهي خلال ${daysLeft} أيام`;

          const html = buildExpiryEmailHtml(storeName, daysLeft, expiresAt);
          tasks.push(sendEmailDmail(email, subject, html));
        }

        // SMS for 3 days or less
        if (phone && daysLeft <= 3) {
          const { sendSms } = await import('@/server/messaging/send-sms');
          const message = `تنبيه هام: اشتراك ${storeName} في ثقة ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}. جدد الآن للحفاظ على تقييماتك.`;
          tasks.push(sendSms(phone, message));
        }

        await Promise.allSettled(tasks);

        // Mark as notified
        await doc.ref.update({
          [`alerts.${alertKey}`]: now,
        });

        results.notified++;
        results.details.push({ storeUid, daysLeft, notified: true });

      } catch (err) {
        console.error(`Failed to notify store ${storeUid}:`, err);
        results.errors++;
        results.details.push({ storeUid, daysLeft, notified: false });
      }
    }

    // Also check for already expired (grace period)
    const expiredSnap = await db.collection('stores')
      .where('subscription.expiresAt', '<=', now)
      .where('subscription.expiresAt', '>', now - (7 * 24 * 60 * 60 * 1000)) // Expired within 7 days
      .get();

    results.checked += expiredSnap.size;

    for (const doc of expiredSnap.docs) {
      const store = doc.data();
      const storeUid = doc.id;

      // Check if already notified for expiry
      const lastExpiredAlert = store.alerts?.subscription_expired;
      if (lastExpiredAlert && (now - lastExpiredAlert) < (24 * 60 * 60 * 1000)) {
        continue;
      }

      const ownerSnap = await db.collection('owners').doc(storeUid).get();
      const owner = ownerSnap.data();
      const email = owner?.email || store.merchant?.email;
      const storeName = store.merchant?.name || store.salla?.storeName || 'متجرك';

      if (email) {
        try {
          const { sendEmailDmail } = await import('@/server/messaging/email-dmail');
          const subject = `❌ انتهى اشتراك ${storeName} - جدد الآن`;
          const html = buildExpiredEmailHtml(storeName);
          await sendEmailDmail(email, subject, html);

          await doc.ref.update({
            'alerts.subscription_expired': now,
          });

          results.notified++;
        } catch (err) {
          console.error(`Failed to notify expired store ${storeUid}:`, err);
          results.errors++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });

  } catch (error) {
    console.error('Subscription Alerts Cron Error:', error);
    return res.status(500).json({ error: 'Failed to process subscription alerts' });
  }
}

function buildExpiryEmailHtml(storeName: string, daysLeft: number, expiresAt: number): string {
  const expiryDate = new Date(expiresAt).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family: Tahoma, Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <h2 style="color: ${daysLeft <= 3 ? '#dc2626' : '#f59e0b'}; margin-bottom: 24px;">
      ${daysLeft <= 3 ? '⚠️' : '📅'} تذكير باشتراك ${storeName}
    </h2>
    <p style="font-size: 16px; color: #374151; line-height: 1.8;">
      اشتراكك في <strong>ثقة - مشتري موثق</strong> سينتهي خلال <strong style="color: ${daysLeft <= 3 ? '#dc2626' : '#f59e0b'};">${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}</strong>.
    </p>
    <p style="font-size: 14px; color: #6b7280;">
      تاريخ الانتهاء: ${expiryDate}
    </p>
    <p style="font-size: 16px; color: #374151; line-height: 1.8; margin-top: 20px;">
      جدد اشتراكك الآن للحفاظ على:
    </p>
    <ul style="color: #374151; font-size: 14px; line-height: 2;">
      <li>✅ شهادة توثيق التقييمات</li>
      <li>✅ شارات "مشتري موثق" على تقييماتك</li>
      <li>✅ طلبات التقييم التلقائية</li>
      <li>✅ لوحة التحكم والتحليلات</li>
    </ul>
    <div style="text-align: center; margin-top: 32px;">
      <a href="https://theqah.com.sa/dashboard" style="display: inline-block; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
        جدد الآن
      </a>
    </div>
  </div>
</body>
</html>`;
}

function buildExpiredEmailHtml(storeName: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family: Tahoma, Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <h2 style="color: #dc2626; margin-bottom: 24px;">
      ❌ انتهى اشتراك ${storeName}
    </h2>
    <p style="font-size: 16px; color: #374151; line-height: 1.8;">
      للأسف، انتهت صلاحية اشتراكك في <strong>ثقة - مشتري موثق</strong>.
    </p>
    <p style="font-size: 16px; color: #374151; line-height: 1.8; margin-top: 20px;">
      تم إيقاف الخدمات التالية:
    </p>
    <ul style="color: #dc2626; font-size: 14px; line-height: 2;">
      <li>❌ شهادة التوثيق لم تعد تظهر</li>
      <li>❌ شارات المشتري الموثق متوقفة</li>
      <li>❌ طلبات التقييم التلقائية متوقفة</li>
    </ul>
    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      جدد اشتراكك الآن لاستعادة جميع المميزات. تقييماتك السابقة محفوظة وستظهر فور التجديد.
    </p>
    <div style="text-align: center; margin-top: 32px;">
      <a href="https://theqah.com.sa/dashboard" style="display: inline-block; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
        جدد اشتراكك الآن
      </a>
    </div>
  </div>
</body>
</html>`;
}

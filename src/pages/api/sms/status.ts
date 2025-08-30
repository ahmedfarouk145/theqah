import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { info, warn } from '@/lib/logger';

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return String(v[0] ?? '');
  if (v == null) return '';
  return String(v);
}

function normPhone(p?: string) {
  const msisdn = (p || '').replace(/[^\d]/g, '');
  return msisdn; // بنحتفظ بالأرقام فقط (مثل 9665XXXXXXXX)
}

function normStatus(s?: string) {
  const x = (s || '').toLowerCase();
  if (['delivered', 'delivrd', 'success', 'delivered_ok'].includes(x)) return 'delivered';
  if (['failed', 'undelivered', 'rejected', 'expired', 'blocked', 'error'].includes(x)) return 'failed';
  if (['sent', 'accepted', 'queued', 'submitted', 'pending', 'process', 'processing'].includes(x)) return 'pending';
  return x || 'unknown';
}

function parseIso(ts?: string) {
  const t = Date.parse(String(ts || ''));
  return Number.isFinite(t) ? t : Date.now();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // التحقق من السر: نقبل من الهيدر أو الكويري أو البودي
    const shared = process.env.OURSMS_DLR_SHARED_SECRET;
    const provided =
      (req.headers['x-oursms-secret'] as string) ||
      (asString((req.query || {}).secret)) ||
      (asString((req.body || {}).secret));
    if (shared && (!provided || provided !== shared)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    if (req.method !== 'POST') return res.status(405).end();

    const body = req.body as unknown;
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: Array<Record<string, unknown>> = Array.isArray((body as any)?.statuses)
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (body as any).statuses
      : [];

    if (!Array.isArray(list) || list.length === 0) {
      // fallback: بعض المزودين يرسلون حدثًا واحدًا بلا مصفوفة
      const single = (body && typeof body === 'object') ? (body as Record<string, unknown>) : null;
      if (single && (single.status || single.msgId || single.dest)) {
        list.push(single as Record<string, unknown>);
      }
    }

    if (list.length === 0) {
      return res.status(400).json({ ok: false, error: 'bad_payload' });
    }

    let processed = 0;

    // عالج كل حالة
    await Promise.all(
      list.map(async (it) => {
        const phone = normPhone(asString(it.dest || it.msisdn || it.to || it.phone));
        const messageId = asString(it.msgId || it.message_id || it.id || it.msgid);
        const jobId = asString(it.jobId || it.batchId || '');
        const statusRaw = asString(it.status || it.dlr || it.state);
        const status = normStatus(statusRaw);
        const msgDate = parseIso(asString(it.msgDate));
        const statusDate = parseIso(asString(it.statusDate));

        const logDocId = messageId || `${phone}:${statusDate}`;
        await dbAdmin().collection('sms_logs').doc(logDocId).set(
          {
            provider: 'oursms',
            phone,
            messageId: messageId || null,
            jobId: jobId || null,
            status,
            msgDate,
            statusDate,
            raw: {
              jobId, messageId, phone, status, msgDate, statusDate,
            },
            at: Date.now(),
          },
          { merge: true }
        );

        // حدّث أقرب دعوة خلال آخر 48 ساعة بنفس الرقم
        try {
          const since = Date.now() - 48 * 60 * 60 * 1000;
          const invSnap = await dbAdmin()
            .collection('review_invites')
            .where('customerPhone', '==', phone)
            .where('createdAt', '>=', since)
            .limit(1)
            .get();

          if (!invSnap.empty) {
            await invSnap.docs[0].ref.set(
              { lastDeliveryStatus: status, deliveryAt: statusDate },
              { merge: true }
            );
          }
        } catch (e) {
          warn('sms.dlr_invite_update_failed', { err: (e as Error).message?.slice(0, 200) });
        }

        processed++;
        info('sms.dlr', { status, phone, messageId, jobId });
      })
    );

    return res.status(200).json({ ok: true, processed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    warn('sms.dlr_error', { err: msg });
    return res.status(500).json({ ok: false, error: msg });
  }
}

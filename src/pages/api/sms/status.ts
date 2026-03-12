// src/pages/api/sms/status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SmsService } from '@/server/services/sms.service';
import { info, warn } from '@/lib/logger';
import { sanitizePhone } from '@/server/monitoring/sanitize';

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return String(v[0] ?? '');
  if (v == null) return '';
  return String(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify secret
    const shared = process.env.OURSMS_DLR_SHARED_SECRET;
    const provided =
      (req.headers['x-oursms-secret'] as string) ||
      asString(req.query?.secret) ||
      asString((req.body as Record<string, unknown>)?.secret);

    if (shared && (!provided || provided !== shared)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    if (req.method !== 'POST') return res.status(405).end();

    const smsService = new SmsService();
    const items = smsService.parseStatusItems(req.body);

    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: 'bad_payload' });
    }

    const processed = await smsService.processStatusUpdates(items);

    items.forEach(it => {
      info('sms.dlr', { status: it.status, phoneMasked: sanitizePhone(it.phone), messageId: it.messageId, jobId: it.jobId });
    });

    return res.status(200).json({ ok: true, processed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    warn('sms.dlr_error', { err: msg });
    return res.status(500).json({ ok: false, error: msg });
  }
}

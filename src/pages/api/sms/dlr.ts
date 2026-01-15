// src/pages/api/sms/dlr.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SmsService } from '@/server/services/sms.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const smsService = new SmsService();
    const items = smsService.extractDlrItems(req.body);

    if (!items.length) {
      return res.json({ ok: true, updated: 0 });
    }

    const updated = await smsService.processDlr(items);
    return res.json({ ok: true, updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: message });
  }
}

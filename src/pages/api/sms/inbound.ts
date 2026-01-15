// src/pages/api/sms/inbound.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SmsService } from '@/server/services/sms.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { from, body, secret } = req.body || {};
  if (secret !== process.env.OURSMS_INBOUND_SECRET) return res.status(401).end();

  const smsService = new SmsService();
  await smsService.handleInbound(from, body);

  return res.status(200).json({ ok: true });
}

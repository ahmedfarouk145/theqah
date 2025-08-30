import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';

type SubscribePayload = {
  name: string;
  event: string;
  version?: number;           // 2 افتراضي
  url: string;
  secret?: string;            // لسياستك Signature
  headers?: { key: string; value: string }[];
  rule?: string;              // فلاتر اختيارية
};

async function subscribe(baseUrl: string, token: string, payload: SubscribePayload) {
  const r = await fetch(`${baseUrl}/webhooks/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Subscribe failed ${r.status}: ${JSON.stringify(j)}`);
  return j as Record<string, unknown>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await verifyAdmin(req);
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const {
    accessToken,
    webhookUrl = `${process.env.PUBLIC_BASE_URL ?? 'https://theqah.com.sa'}/api/salla/webhook`,
    secret = process.env.SALLA_WEBHOOK_SECRET || '',
    events = ['order.created','order.status.updated','order.cancelled'] as string[],
  } = (req.body || {}) as {
    accessToken: string;
    webhookUrl?: string;
    secret?: string;
    events?: string[];
  };

  const baseUrl = 'https://api.salla.dev/admin/v2';
  const results: Record<string, unknown>[] = [];

  for (const ev of events) {
    const resp = await subscribe(baseUrl, accessToken, {
      name: `theqah:${ev}`,
      event: ev,
      version: 2,
      url: webhookUrl,
      secret,
    });
    results.push({ event: ev, resp });
  }

  return res.status(200).json({ ok: true, results });
}

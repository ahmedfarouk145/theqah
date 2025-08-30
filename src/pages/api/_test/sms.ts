// src/pages/api/_test/sms.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendSms } from "@/server/messaging/send-sms";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const to = (req.query.to as string) || "+201234567890";
    const text = (req.query.text as string) || "Test SMS from Theqah";
    const r = await sendSms(to, text);
    res.status(r.ok ? 200 : 502).json(r);
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}

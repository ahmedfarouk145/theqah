// src/pages/api/_test/email.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const to = (req.query.to as string) || "you@yourdomain.com";
    const r = await sendEmail(to, "Test from Theqah", "<b>Hello</b>");
    res.status(200).json(r);
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

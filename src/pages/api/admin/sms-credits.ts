// src/pages/api/admin/sms-credits.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const base = (process.env.OURSMS_BASE_URL || "").replace(/\/+$/, "");
  const url  = `${base}/billing/credits`;
  const token = process.env.OURSMS_API_KEY;

  try {
    if (!token) throw new Error("Missing OURSMS_API_KEY");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null; try { json = JSON.parse(text); } catch {}

    if (!r.ok) {
      return res.status(r.status).json({ ok:false, error:`oursms_http_${r.status}`, debug:{ url, status:r.status, responseText:text, responseJson:json }});
    }
    return res.status(200).json({ ok:true, data: json ?? text });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ ok:false, error:e?.message||"credits_failed" });
  }
}

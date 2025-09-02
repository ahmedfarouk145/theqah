import type { NextApiRequest, NextApiResponse } from "next";
import { buildInviteSMS, sendSMSViaOursms } from "@/server/messaging/send-sms"; // لو عندك الموديولات دي

type AnyBody = Record<string, unknown> | null | undefined;

function parseBody(req: NextApiRequest): AnyBody {
  try {
    if (typeof req.body === "string") return JSON.parse(req.body || "{}");
    if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  } catch {}
  return {};
}

function grabStrings(x: unknown): string[] {
  if (typeof x === "string" && x.trim()) return [x.trim()];
  if (Array.isArray(x)) return x.map(String).map(s => s.trim()).filter(Boolean);
  return [];
}

function normalizeRecipients(req: NextApiRequest): string[] {
  const b = parseBody(req) || {};
  const q = req.query || {};
  const candidates = [
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b as any).to, (b as any).dest, (b as any).dests,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b as any).phone, (b as any).phones, (b as any).msisdn,
    q.to, q.dest, q.dests, q.phone, q.phones, q.msisdn
  ];
  const out = new Set<string>();
  for (const c of candidates) grabStrings(c).forEach(v => out.add(v));
  return Array.from(out);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const body = parseBody(req) || {};
    const recipients = normalizeRecipients(req);

    if (recipients.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "missing_to",
        hint: "أرسل الحقل to كنص أو مصفوفة. مقبولة أيضاً: dest, dests, phone, phones, msisdn. تأكد من Content-Type: application/json"
      });
    }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeName = String((body as any).store ?? "") || undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = String((body as any).link ?? "") || "https://example.com/review";
    const text: string =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (typeof (body as any).text === "string" && (body as any).text.trim())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? String((body as any).text)
        : buildInviteSMS(storeName, link); // رسالتك الموحّدة

    const result = await sendSMSViaOursms({
      to: recipients,               // يقبل مصفوفة
      text,
      msgClass: "transactional",
      priority: 0,
      requestDlr: false,
    });

    return res.status(200).json(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "sms_failed",
      message: e?.message || String(e),
    });
  }
}

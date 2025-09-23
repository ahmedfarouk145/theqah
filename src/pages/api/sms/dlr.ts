// src/pages/api/sms/dlr.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin"; // ← كان "@/server/firebase-admin" وده سبب الخطأ

type DeliveryStatus = string; // لو عايز تشددها: 'delivered' | 'ok' | 'success' | 'failed' | 'undelivered' | string

interface DlrMeta {
  inviteId?: string;
}

interface DlrItem {
  inviteId?: string;
  meta?: DlrMeta;
  status?: DeliveryStatus;
  Status?: DeliveryStatus; // بعض المزودين بيرسلوها بحرف كبير
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asDlrItem(v: unknown): DlrItem | null {
  if (!isRecord(v)) return null;
  const inviteId =
    (typeof v.inviteId === "string" && v.inviteId) ||
    (isRecord(v.meta) && typeof v.meta.inviteId === "string" && v.meta.inviteId) ||
    undefined;

  const status =
    (typeof v.status === "string" && v.status) ||
    (typeof v.Status === "string" && v.Status) ||
    undefined;

  // نسمح بإنشاء العنصر حتى لو inviteId ناقص (هنفلتره لاحقاً)
  return { inviteId, meta: isRecord(v.meta) ? { inviteId: v.meta.inviteId as string | undefined } : undefined, status, Status: undefined };
}

function extractItems(body: unknown): DlrItem[] {
  if (Array.isArray(body)) {
    return body.map(asDlrItem).filter((x): x is DlrItem => !!x);
  }
  if (isRecord(body)) {
    const maybeItems = body.items ?? body.dlrs;
    if (Array.isArray(maybeItems)) {
      return maybeItems.map(asDlrItem).filter((x): x is DlrItem => !!x);
    }
    const single = asDlrItem(body);
    return single ? [single] : [];
  }
  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const items = extractItems(req.body);
    if (!items.length) return res.json({ ok: true, updated: 0 });

    const db = dbAdmin();
    const ops: Promise<void>[] = [];

    for (const it of items) {
      const inviteId = it.inviteId ?? it.meta?.inviteId;
      if (!inviteId || typeof inviteId !== "string") continue;

      const status = String((it.status ?? it.Status ?? "")).toLowerCase();
      const delivered = ["delivered", "ok", "success"].includes(status);

      ops.push(
        db
          .collection("review_invites")
          .doc(inviteId)
          .set(
            {
              deliveryStatus: status || null,
              deliveredAt: delivered ? Date.now() : null,
            },
            { merge: true }
          )
          .then(() => void 0)
      );
    }

    await Promise.allSettled(ops);
    res.json({ ok: true, updated: ops.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message });
  }
}

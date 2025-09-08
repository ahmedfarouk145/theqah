// src/pages/api/salla/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

type StatusOk = {
  ok: true;
  connected: boolean;
  uid?: string | null;
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
  reason?: string;
};
type StatusFail = { ok: false; error: string };

function normalizeConnected(d: Record<string, unknown> | undefined) {
  const s = (d?.salla || {}) as Record<string, unknown>;
  const connected = Boolean(s.connected);
  const installedAt = Number(s.installedAt ?? d?.installedAt ?? 0);
  const uninstalledAt = Number(d?.uninstalledAt ?? 0);
  return connected && (!uninstalledAt || uninstalledAt < installedAt);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusOk | StatusFail>
) {
  try {
    const db = dbAdmin();

    // A) لو معاك uid= salla:{STORE_ID} اقرأه مباشرةً من stores/{uid}
    const uidParam = typeof req.query.uid === "string" ? req.query.uid : undefined;
    if (uidParam) {
      const snap = await db.collection("stores").doc(uidParam).get();
      if (!snap.exists) {
        return res.status(200).json({ ok: true, connected: false, uid: uidParam, reason: "not_found" });
      }
      const data = snap.data() || {};
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (data as any).salla || {};
      return res.status(200).json({
        ok: true,
        connected: normalizeConnected(data),
        uid: snap.id,
        storeId: s.storeId ?? null,
        storeName: s.storeName ?? null,
        domain: s.domain ?? null,
        reason: "read_by_uid",
      });
    }

    // B) وإلا… لازم توكن؛ نقرأ alias عند ownerUid → storeUid → المستند الحقيقي
    try {
      await verifyStore(req); // يتأكد من Authorization: Bearer <idToken>
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 401).json({ ok: false, error: err.message || "Unauthorized" });
    }

    const { storeId } = req as AuthedRequest; // ده ownerUid المنطقي لحسابك
    if (!storeId) return res.status(400).json({ ok: false, error: "Missing owner storeId" });

    const ownerDoc = await db.collection("stores").doc(storeId).get();
    if (!ownerDoc.exists) {
      return res.status(200).json({ ok: true, connected: false, reason: "owner_doc_missing" });
    }
    const ownerData = ownerDoc.data() || {};
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeUid = (ownerData as any).storeUid as string | undefined;

    const realUid = storeUid || ownerDoc.id; // لو الحقيقية أصلاً فيها salla
    const realDoc = await db.collection("stores").doc(realUid).get();
    if (!realDoc.exists) {
      return res.status(200).json({ ok: true, connected: false, uid: realUid, reason: "real_doc_missing" });
    }
    const realData = realDoc.data() || {};
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (realData as any).salla || {};
    return res.status(200).json({
      ok: true,
      connected: normalizeConnected(realData),
      uid: realDoc.id,
      storeId: s.storeId ?? null,
      storeName: s.storeName ?? null,
      domain: s.domain ?? null,
      reason: storeUid ? "via_owner_alias" : "owner_as_real",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
}

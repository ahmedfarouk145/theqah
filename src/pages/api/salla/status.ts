import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin, authAdmin } from "@/lib/firebaseAdmin";

type StatusOk = {
  ok: true;
  connected: boolean;
  uid?: string | null;          // السجل المقروء (غالبًا "salla:{id}")
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
  reason?: string;
};
type StatusFail = { ok: false; error: string };

const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function normalizeConnected(d: Record<string, unknown> | undefined) {
  const s = (d?.salla || {}) as Record<string, unknown>;
  const connected = Boolean(s.connected);
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installedAt = Number(s.installedAt ?? (d as any)?.installedAt ?? 0);
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uninstalledAt = Number((d as any)?.uninstalledAt ?? 0);
  return connected && (!uninstalledAt || uninstalledAt < installedAt);
}

async function resolveUidFromToken(req: NextApiRequest): Promise<string | null> {
  // تحقّق من المستخدم
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  try {
    const dec = await authAdmin().verifyIdToken(token);
    const ownerUid = dec.uid;

    const db = dbAdmin();
    // 1) alias: stores/{ownerUid} → storeUid
    const aliasSnap = await db.collection("stores").doc(ownerUid).get();
    if (aliasSnap.exists) {
      const a = aliasSnap.data() || {};
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeUid = (a as any).storeUid as string | undefined;
      if (storeUid) return storeUid;
    }
    // 2) استرجاع مباشر لمتجر سلة الخاص بالـ ownerUid
    const q = await db
      .collection("stores")
      .where("platform", "==", "salla")
      .where("ownerUid", "==", ownerUid)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0].id;

    return null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusOk | StatusFail>
) {
  try {
    const db = dbAdmin();

    // أولوية: uid صريح في الكويري
    let uid = typeof req.query.uid === "string" ? req.query.uid : undefined;

    // وإلا حاول حلّه من توكن المستخدم (alias → مستند سلة الحقيقي)
    if (!uid) {
      uid = await resolveUidFromToken(req) ?? undefined;
    }

    if (!uid) {
      return res.status(400).json({ ok: false, error: "Missing uid (salla:{id}) and no resolvable user alias" });
    }

    // اقرأ مستند سلة الحقيقي
    const doc = await db.collection("stores").doc(uid).get();
    if (doc.exists) {
      const data = doc.data() || {};
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (data as any).salla || {};
      return res.status(200).json({
        ok: true,
        connected: normalizeConnected(data),
        uid: doc.id,
        storeId: s.storeId ?? null,
        storeName: s.storeName ?? null,
        domain: s.domain ?? null,
        reason: "read_salla_doc",
      });
    }

    // fallback: لو عندك توكنات
    const tok = await db.collection("salla_tokens").doc(uid).get();
    if (tok.exists) {
      const t = tok.data() || {};
      return res.status(200).json({
        ok: true,
        connected: true,
        uid,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        storeId: (t as any).storeId ?? null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        storeName: (t as any).storeName ?? null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        domain: (t as any).storeDomain ?? null,
        reason: "fallback_by_tokens",
      });
    }

    return res.status(200).json({ ok: true, connected: false, uid, reason: "not_found" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: asMsg(e) });
  }
}

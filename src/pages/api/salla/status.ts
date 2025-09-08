// src/pages/api/salla/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

type StatusOk = {
  ok: true;
  connected: boolean;
  uid?: string | null;
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
  apiBase?: string | null;
  reason?: string;
};
type StatusFail = { ok: false; error: string };

function asMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function parseCookies(raw?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  raw.split(/;\s*/).forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[decodeURIComponent(p.slice(0, i).trim())] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function normalizeConnected(docData: Record<string, unknown> | undefined): boolean {
  const s = (docData?.salla || {}) as Record<string, unknown>;
  const connectedFlag = Boolean(s.connected);
  const installedAt = Number(s.installedAt ?? docData?.installedAt ?? 0) || 0;
  const uninstalledAt = Number(docData?.uninstalledAt ?? 0) || 0;
  if (!connectedFlag) return false;
  if (!installedAt) return true;
  if (!uninstalledAt) return true;
  return uninstalledAt < installedAt;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusOk | StatusFail>
) {
  try {
    const db = dbAdmin();

    const qUid = typeof req.query.uid === "string" ? req.query.uid : undefined;
    const cookies = parseCookies(req.headers.cookie || "");
    const cUid = cookies["salla_store_uid"];
    const ownerUid = typeof req.query.ownerUid === "string" ? req.query.ownerUid : undefined;

    let uid: string | undefined = qUid || cUid;

    // alias: stores/{ownerUid} => { storeUid }
    if (!uid && ownerUid) {
      const aliasDoc = await db.collection("stores").doc(ownerUid).get();
      if (aliasDoc.exists) {
        const alias = aliasDoc.data() || {};
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storeUid = (alias as any).storeUid as string | undefined;
        if (storeUid) uid = storeUid;
      }
    }

    if (uid) {
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
          apiBase: s.apiBase ?? null,
          reason: "read_by_uid",
        });
      }

      // fallback: salla_tokens/{uid}
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
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          apiBase: (t as any).apiBase ?? null,
          reason: "fallback_by_tokens",
        });
      }

      return res.status(200).json({ ok: true, connected: false, uid, reason: "not_found" });
    }

    return res.status(200).json({ ok: true, connected: false, reason: "no_uid" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: asMsg(e) });
  }
}

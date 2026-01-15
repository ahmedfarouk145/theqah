// src/pages/api/salla/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { StoreService } from "@/server/services/store.service";

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

function parseCookies(raw?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  raw.split(/;\s*/).forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[decodeURIComponent(p.slice(0, i).trim())] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusOk | StatusFail>
) {
  try {
    const storeService = new StoreService();

    const qUid = typeof req.query.uid === "string" ? req.query.uid : undefined;
    const cookies = parseCookies(req.headers.cookie || "");
    const cUid = cookies["salla_store_uid"];
    const ownerUid = typeof req.query.ownerUid === "string" ? req.query.ownerUid : undefined;

    let uid: string | undefined = qUid || cUid;

    // Resolve alias if needed
    if (!uid && ownerUid) {
      const resolved = await storeService.resolveStoreUidFromAlias(ownerUid);
      if (resolved) uid = resolved;
    }

    if (uid) {
      const status = await storeService.getSallaConnectionStatus(uid);
      return res.status(200).json({ ok: true, ...status });
    }

    return res.status(200).json({ ok: true, connected: false, reason: "no_uid" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
}

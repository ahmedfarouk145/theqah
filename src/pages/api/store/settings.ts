// src/pages/api/store/settings.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

type SallaDoc = {
  salla?: {
    connected?: boolean;
    storeName?: string;
    storeId?: string | number;
    reviewTemplate?: string;
    domain?: string;
    apiBase?: string;
    installed?: boolean;
    installedAt?: number;
    uninstalledAt?: number | null;
  };
  updatedAt?: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ✅ تحقق الهوية/الملكية (verifyStore يملأ AuthedRequest.storeId أو يرمي خطأ)
  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || "Unauthorized" });
  }

  const { storeId } = req as AuthedRequest;
  if (!storeId) return res.status(400).json({ message: "Missing storeId" });

  const db = dbAdmin();
  const ref = db.collection("stores").doc(storeId);

  try {
    if (req.method === "GET") {
      const snap = await ref.get();
      if (!snap.exists) {
        // أول مرة: رجع حالة افتراضية
        return res.status(200).json({ ok: true, salla: { connected: false } });
      }

      const data = snap.data() as SallaDoc | undefined;
      const s = data?.salla ?? {};

      return res.status(200).json({
        ok: true,
        salla: {
          connected: !!s.connected,
          storeName: s.storeName ?? null,
          merchantId: s.storeId != null ? String(s.storeId) : undefined,
          reviewTemplate: s.reviewTemplate ?? undefined,
          domain: s.domain ?? undefined,
          apiBase: s.apiBase ?? undefined,
          updatedAt: data?.updatedAt ?? undefined,
        },
      });
    }

    if (req.method === "POST") {
      const body = (req.body || {}) as {
        salla?: { reviewTemplate?: string };
      };

      await ref.set(
        {
          salla: { reviewTemplate: body?.salla?.reviewTemplate ?? null },
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  } catch (error) {
    console.error("Settings Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

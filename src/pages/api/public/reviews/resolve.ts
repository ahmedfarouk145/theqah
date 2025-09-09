// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

function toHost(input: string): string | null {
  try {
    if (!input) return null;
    // لو وصل host فقط
    if (!/^[a-z]+:\/\//i.test(input)) return input.split("/")[0].toLowerCase();
    const u = new URL(input);
    return u.host.toLowerCase();
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const hostParam = (req.query.host as string) || req.headers.origin || "";
  const host = toHost(hostParam);
  if (!host) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(400).json({ error: "BAD_HOST" });
  }

  try {
    const db = dbAdmin();

    // 1) أسرع: جدول مابنج مباشر storeHosts/{host}
    const mapDoc = await db.collection("storeHosts").doc(host).get();
    if (mapDoc.exists) {
      const storeUid = String(mapDoc.get("storeUid") || "");
      if (storeUid) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(200).json({ storeUid });
      }
    }

    // 2) بديل: استعلم من stores (يفضَّل يكون عندك field domainHost = "demostore.salla.sa")
    const snap = await db.collection("stores").where("domainHost", "==", host).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      const storeUid = String(d.get("uid") || d.get("storeUid") || "");
      if (storeUid) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(200).json({ storeUid });
      }
    }

    // مش لاقي
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(404).json({ error: "STORE_NOT_FOUND" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("public/reviews/resolve error:", message);
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: "RESOLVE_FAILED", message });
  }
}

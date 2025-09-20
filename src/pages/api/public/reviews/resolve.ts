import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

/**
 * lookup strategy:
 *   - if storeUid provided → return it as-is (أسرع وأضمن)
 *   - else href=fullURL → نستخرج base = origin[/dev-xxxx] ونقرأ doc من domains/{base}
 * لا يوجد fallback/approx matching إطلاقًا.
 */

function parseHrefBase(raw: unknown): { base: string } {
  try {
    const u = new URL(String(raw || ""));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    const base = firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
    return { base };
  } catch {
    return { base: "" };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS للودجت
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")   return res.status(405).json({ error: "method_not_allowed" });

  try {
    const storeUid = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
    if (storeUid) return res.status(200).json({ storeUid });

    const href = typeof req.query.href === "string" ? req.query.href.trim() : "";
    if (!href) return res.status(400).json({ error: "MISSING_INPUT", hint: "send storeUid or href" });

    const { base } = parseHrefBase(href);
    if (!base) return res.status(400).json({ error: "INVALID_HREF" });

    const db = dbAdmin();
    const doc = await db.collection("domains").doc(base).get();
    if (!doc.exists) {
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين. تأكد من أن التطبيق مثبت وأن الدومين مسجل.",
        baseTried: base
      });
    }
    const data = doc.data() as { storeUid?: string };
    if (!data?.storeUid) {
      return res.status(404).json({ error: "UID_NOT_FOUND_FOR_DOMAIN", baseTried: base });
    }
    return res.status(200).json({ storeUid: data.storeUid });
  } catch (e) {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error("[resolve] unexpected", typeof e === "object" && e && "message" in e ? (e as any).message : e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}

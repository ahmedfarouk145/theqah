import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

function normalizeUrl(raw: unknown): URL | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try { return new URL(withProto); } catch { return null; }
}

function parseHrefBase(raw: unknown): { base: string; host: string; isTrial: boolean } {
  const u = normalizeUrl(raw);
  if (!u) return { base: "", host: "", isTrial: false };
  const origin = u.origin.toLowerCase();
  const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
  const isTrial = firstSeg.startsWith("dev-");
  const base = isTrial ? `${origin}/${firstSeg}` : origin;
  return { base, host: u.host.toLowerCase(), isTrial };
}

function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const u = normalizeUrl(domain);
  if (!u) return null;
  const origin = u.origin.toLowerCase();
  const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
  return firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
}

function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/\?/g, "_QUEST_")
    .replace(/#/g, "_HASH_")
    .replace(/&/g, "_AMP_");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const storeUidParam = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
    if (storeUidParam) {
      return res.status(200).json({ storeUid: storeUidParam });
    }

    const href = typeof req.query.href === "string" ? req.query.href.trim() : "";
    if (!href) return res.status(400).json({ error: "MISSING_INPUT", hint: "send storeUid or href" });

    const { base, host, isTrial } = parseHrefBase(href);
    const db = dbAdmin();
    let doc: FirebaseFirestore.DocumentSnapshot | null = null;

    if (base) {
      // direct: salla.domain (قديم) ثم domain.base (جديد)
     const directSnap = await db.collection("stores")
        .where("salla.domain", "==", base)
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1).get();
      if (!directSnap.empty) doc = directSnap.docs[0];

      if (!doc) {
        const snapNew = await db.collection("stores")
          .where("domain.base", "==", base)
          .limit(1).get();
        if (!snapNew.empty) doc = snapNew.docs[0];
      }

      // via domains
      if (!doc) {
        try {
          const encodedBase = encodeUrlForFirestore(base);
          let domainDoc = await db.collection("domains").doc(encodedBase).get();
          if (!domainDoc.exists) {
            try { domainDoc = await db.collection("domains").doc(base).get(); } catch {}
          }
          if (domainDoc.exists) {
            const d = domainDoc.data() as { storeUid?: string; uid?: string } | undefined;
            const fromUid = d?.storeUid || d?.uid;
            if (fromUid) {
              const storeDoc = await db.collection("stores").doc(fromUid).get();
              if (storeDoc.exists) doc = storeDoc;
            }
          }

          if (!doc) {
            const normalizedBase = toDomainBase(base);
            if (normalizedBase && normalizedBase !== base) {
              const encNorm = encodeUrlForFirestore(normalizedBase);
              let normDoc = await db.collection("domains").doc(encNorm).get();
              if (!normDoc.exists) {
                try { normDoc = await db.collection("domains").doc(normalizedBase).get(); } catch {}
              }
              if (normDoc.exists) {
                const nd = normDoc.data() as { storeUid?: string; uid?: string } | undefined;
                const fromUid = nd?.storeUid || nd?.uid;
                if (fromUid) {
                  const storeDoc = await db.collection("stores").doc(fromUid).get();
                  if (storeDoc.exists) doc = storeDoc;
                }
              }
            }
          }
        } catch (e) {
          console.warn("[resolve] domain lookup failed:", e);
        }
      }

      // variations (لو مش trial)
      if (!doc && !isTrial) {
        const normalizedBase = toDomainBase(base);
        const variations = [
          base,
          normalizedBase,
          base.replace(/^https?:\/\//i, ""),
          base.replace(/^https?:\/\//i, "").replace(/^www\./i, ""),
          `https://${host}`,
          `http://${host}`,
          host,
          `www.${host}`,
        ].filter((v, i, arr) => v && arr.indexOf(v) === i);

        for (const v of variations) {
         const snapVar = await db.collection("stores")
            .where("salla.domain", "==", v)
            .where("salla.connected", "==", true)
            .where("salla.installed", "==", true)
            .limit(1).get();
          if (!snapVar.empty) { doc = snapVar.docs[0]; break; }

          const snapVarNew = await db.collection("stores")
            .where("domain.base", "==", v).limit(1).get();
          if (!snapVarNew.empty) { doc = snapVarNew.docs[0]; break; }
        }
      }
    } else {
      // fallback: storeId
      const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim()
        ? req.query.storeId.trim()
        : undefined;
      if (!storeId) return res.status(400).json({ error: "INVALID_HREF" });

      const snapNum = await db.collection("stores")
        .where("salla.storeId", "==", Number(storeId))
        .where("salla.connected", "==", true)
        .where("salla.installed", "==", true)
        .limit(1).get();
      if (!snapNum.empty) {
        doc = snapNum.docs[0];
      } else {
        const snapStr = await db.collection("stores")
          .where("salla.storeId", "==", storeId)
          .where("salla.connected", "==", true)
          .where("salla.installed", "==", true)
          .limit(1).get();
        if (!snapStr.empty) {
          doc = snapStr.docs[0];
        } else {
          const snapUid = await db.collection("stores")
            .where("uid", "==", `salla:${storeId}`)
            .where("salla.connected", "==", true)
            .where("salla.installed", "==", true)
            .limit(1).get();
          if (!snapUid.empty) { doc = snapUid.docs[0]; }
        }
      }
    }

    if (!doc) {
      console.warn("[resolve] Store not found:", { baseTried: base, host, href, ts: new Date().toISOString() });
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين/المعرف.",
        baseTried: base, hostTried: host,
        debug: { parsedBase: base, parsedHost: host, originalHref: href },
      });
    }

    const data = doc.data() as {
      storeUid?: string;
      uid?: string;
      salla?: { uid?: string; storeId?: string | number };
    };
    const resolvedUid =
      data.storeUid || data.uid || data.salla?.uid || (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined);

    if (!resolvedUid) return res.status(404).json({ error: "UID_NOT_FOUND_FOR_DOMAIN", baseTried: base });

    return res.status(200).json({ storeUid: resolvedUid });
  } catch (e) {
    console.error("[resolve] unexpected", e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
}

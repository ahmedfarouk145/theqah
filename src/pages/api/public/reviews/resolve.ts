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
  
  // For Salla dev stores, we need to try both with and without dev segment
  if (firstSeg.startsWith("dev-")) {
    console.log(`[resolve] Detected dev store: ${origin}/${firstSeg}`);
    return `${origin}/${firstSeg}`;
  }
  return origin;
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
    const hrefUrl = normalizeUrl(href);
    const db = dbAdmin();
    let doc: FirebaseFirestore.DocumentSnapshot | null = null;

    if (base) {
      console.log(`[resolve] Looking for store with base: ${base}, host: ${host}`);
      
      // Try multiple domain formats for Salla stores
      const domainVariations = [
        base, // Full URL: https://demostore.salla.sa/dev-6pvf7vguhv841foi
        `${host}${base.includes('/') ? base.substring(base.indexOf('/', 8)) : ''}`, // Host + path: demostore.salla.sa/dev-6pvf7vguhv841foi
        host, // Just hostname: demostore.salla.sa
      ];
      
      console.log(`[resolve] Trying variations:`, domainVariations);
      
      for (const variation of domainVariations) {
        // direct: salla.domain (قديم) ثم domain.base (جديد)
        const directSnap = await db.collection("stores")
          .where("salla.domain", "==", variation)
          .where("salla.connected", "==", true)
          .where("salla.installed", "==", true)
          .limit(1).get();
        if (!directSnap.empty) {
          doc = directSnap.docs[0];
          console.log(`[resolve] Found store via salla.domain: ${variation}`);
          break;
        }

        if (!doc) {
          const snapNew = await db.collection("stores")
            .where("domain.base", "==", variation)
            .limit(1).get();
          if (!snapNew.empty) {
            doc = snapNew.docs[0];
            console.log(`[resolve] Found store via domain.base: ${variation}`);
            break;
          }
        }
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

          // extra: try host/dev-xxxxx variant stored in domains as hostname path
          if (!doc && hrefUrl) {
            const firstSeg = hrefUrl.pathname.split("/").filter(Boolean)[0] || "";
            if (firstSeg.startsWith("dev-")) {
              const hostDev = `${host}/${firstSeg}`;
              const encHostDev = encodeUrlForFirestore(hostDev);
              let hostDoc = await db.collection("domains").doc(encHostDev).get();
              if (!hostDoc.exists) {
                try { hostDoc = await db.collection("domains").doc(hostDev).get(); } catch {}
              }
              if (hostDoc.exists) {
                const hd = hostDoc.data() as { storeUid?: string; uid?: string } | undefined;
                const fromUid = hd?.storeUid || hd?.uid;
                if (fromUid) {
                  const storeDoc = await db.collection("stores").doc(fromUid).get();
                  if (storeDoc.exists) doc = storeDoc;
                }
              }
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

    // FINAL FALLBACK: extract identifier from href query (?identifier=...) and resolve by storeId
    if (!doc && hrefUrl) {
      const idFromHref = hrefUrl.searchParams.get("identifier") || hrefUrl.searchParams.get("merchant") || hrefUrl.searchParams.get("store_id");
      if (idFromHref) {
        const snapNum = await db.collection("stores")
          .where("salla.storeId", "==", Number(idFromHref))
          .where("salla.connected", "==", true)
          .where("salla.installed", "==", true)
          .limit(1).get();
        if (!snapNum.empty) {
          doc = snapNum.docs[0];
        } else {
          const snapStr = await db.collection("stores")
            .where("salla.storeId", "==", idFromHref)
            .where("salla.connected", "==", true)
            .where("salla.installed", "==", true)
            .limit(1).get();
          if (!snapStr.empty) {
            doc = snapStr.docs[0];
          } else {
            const snapUid = await db.collection("stores")
              .where("uid", "==", `salla:${idFromHref}`)
              .where("salla.connected", "==", true)
              .where("salla.installed", "==", true)
              .limit(1).get();
            if (!snapUid.empty) { doc = snapUid.docs[0]; }
          }
        }
      }
    }

    if (!doc) {
      // Enhanced debugging for store resolution failure
      const hrefUrl = normalizeUrl(href);
      const identifier = hrefUrl?.searchParams.get("identifier") || hrefUrl?.searchParams.get("merchant");
      
      console.error("[RESOLVE DEBUG] Store not found - Full analysis:");
      console.error(`[RESOLVE DEBUG] Original href: ${href}`);
      console.error(`[RESOLVE DEBUG] Parsed base: ${base}`);
      console.error(`[RESOLVE DEBUG] Host: ${host}`);
      console.error(`[RESOLVE DEBUG] Identifier from URL: ${identifier}`);
      console.error(`[RESOLVE DEBUG] Domain variations tried:`, [
        base,
        `${host}${base?.includes('/') ? base.substring(base.indexOf('/', 8)) : ''}`,
        host,
      ]);
      
      // Quick check what stores actually exist
      const allSallaStores = await db.collection("stores")
        .where("provider", "==", "salla")
        .where("salla.connected", "==", true)
        .limit(5)
        .get();
      
      console.error(`[RESOLVE DEBUG] Found ${allSallaStores.size} connected Salla stores in database:`);
      allSallaStores.docs.forEach(doc => {
        const data = doc.data();
        console.error(`[RESOLVE DEBUG] - Store: ${data.uid}, domain: ${data.salla?.domain || data.domain?.base}, storeId: ${data.salla?.storeId}`);
      });
      
      console.warn("[resolve] Store not found:", { baseTried: base, host, href, identifier, ts: new Date().toISOString() });
      return res.status(404).json({
        error: "STORE_NOT_FOUND",
        message: "لم يتم العثور على متجر لهذا الدومين/المعرف.",
        baseTried: base, hostTried: host, identifier,
        debug: { parsedBase: base, parsedHost: host, originalHref: href, identifier },
        availableStores: allSallaStores.docs.map(d => {
          const data = d.data();
          return { uid: data.uid, domain: data.salla?.domain || data.domain?.base, storeId: data.salla?.storeId };
        })
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

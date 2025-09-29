import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/utils/verifyAdmin";

function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return "";
  return String(url)
    .replace(/\./g, "_DOT_")
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/#/g, "_HASH_")
    .replace(/\?/g, "_QUESTION_")
    .replace(/&/g, "_AMP_");
}

function normalizeUrl(url: string): URL | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return null;
  }
}

function saveMultipleDomainFormats(
  db: FirebaseFirestore.Firestore,
  uid: string,
  originalDomain: string | null | undefined
) {
  if (!originalDomain) return Promise.resolve();
  
  const u = normalizeUrl(originalDomain);
  if (!u) return Promise.resolve();
  
  const hostname = u.host.toLowerCase();
  const origin = u.origin.toLowerCase();
  const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
  
  const domainsToSave = [
    origin, // https://demostore.salla.sa
    hostname, // demostore.salla.sa
  ];
  
  if (firstSeg.startsWith("dev-")) {
    domainsToSave.push(`${origin}/${firstSeg}`, `${hostname}/${firstSeg}`);
  }
  
  console.log(`[MANUAL DOMAIN] Saving multiple domain formats for ${uid}:`, domainsToSave);
  
  const promises = domainsToSave.map(domain => 
    db.collection("domains").doc(encodeUrlForFirestore(domain)).set({
      base: domain,
      key: encodeUrlForFirestore(domain),
      uid,
      storeUid: uid,
      provider: "salla",
      createdManually: true,
      updatedAt: Date.now(),
    }, { merge: true }).catch(err => 
      console.warn(`[MANUAL DOMAIN] Failed to save domain ${domain}:`, err)
    )
  );
  
  return Promise.allSettled(promises);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.success) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { merchantId, domain, storeUid } = req.body;

    if (!merchantId || !domain) {
      return res.status(400).json({ 
        error: "Missing required fields",
        required: ["merchantId", "domain"],
        received: { merchantId: !!merchantId, domain: !!domain, storeUid: !!storeUid }
      });
    }

    const db = dbAdmin();
    const finalStoreUid = storeUid || `salla:${merchantId}`;
    const normalizedDomain = normalizeUrl(domain);

    if (!normalizedDomain) {
      return res.status(400).json({ error: "Invalid domain format", domain });
    }

    const baseDomain = normalizedDomain.origin;
    
    console.log(`[MANUAL DOMAIN] Creating store domain - StoreUid: ${finalStoreUid}, Domain: ${baseDomain}`);

    // 1. Save to stores collection
    const storeDoc = {
      uid: finalStoreUid,
      provider: "salla",
      updatedAt: Date.now(),
      salla: {
        uid: finalStoreUid,
        storeId: merchantId,
        connected: true,
        installed: true,
        domain: baseDomain,
      },
      domain: { 
        base: baseDomain, 
        key: encodeUrlForFirestore(baseDomain), 
        updatedAt: Date.now(),
        createdManually: true 
      },
    };

    await db.collection("stores").doc(finalStoreUid).set(storeDoc, { merge: true });

    // 2. Save to domains collection  
    const domainKey = encodeUrlForFirestore(baseDomain);
    await db.collection("domains").doc(domainKey).set({
      base: baseDomain,
      key: domainKey,
      uid: finalStoreUid,
      storeUid: finalStoreUid,
      provider: "salla",
      createdManually: true,
      updatedAt: Date.now(),
    }, { merge: true });

    // 3. Save multiple domain formats (for dev stores)
    await saveMultipleDomainFormats(db, finalStoreUid, domain);

    console.log(`[MANUAL DOMAIN] Successfully created store domain for ${finalStoreUid}`);

    return res.status(200).json({
      ok: true,
      message: "Store domain created successfully",
      storeUid: finalStoreUid,
      domain: baseDomain,
      testUrls: {
        resolve: `/api/public/reviews/resolve?storeUid=${finalStoreUid}`,
        widget: `/?store=${finalStoreUid}`,
      }
    });

  } catch (error) {
    console.error("[MANUAL DOMAIN] Error:", error);
    return res.status(500).json({ 
      error: "Failed to create store domain",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

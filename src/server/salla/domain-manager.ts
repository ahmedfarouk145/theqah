// src/server/salla/domain-manager.ts
import { dbAdmin } from "@/lib/firebaseAdmin";

/* ===================== Types ===================== */
interface DomainInfo {
  original: string;
  normalized: string;
  hostname: string;
  isDevStore: boolean;
  devSegment?: string;
}

/* ===================== Utility Functions ===================== */
function parseDomain(input: string): DomainInfo {
  const trimmed = input.trim();
  
  try {
    // Ensure protocol
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    
    const hostname = url.hostname.toLowerCase();
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const firstSegment = pathSegments[0] || "";
    
    const isDevStore = firstSegment.startsWith("dev-");
    const normalized = isDevStore ? `${url.origin}/${firstSegment}` : url.origin;
    
    return {
      original: trimmed,
      normalized,
      hostname,
      isDevStore,
      devSegment: isDevStore ? firstSegment : undefined,
    };
  } catch {
    return {
      original: trimmed,
      normalized: trimmed,
      hostname: trimmed,
      isDevStore: false,
    };
  }
}

function createDomainVariations(domain: DomainInfo): string[] {
  const variations = [
    domain.normalized,    // Main normalized domain
    domain.hostname,      // Just hostname
    domain.original,      // Original input
  ];

  // For dev stores, add hostname + path combination
  if (domain.isDevStore && domain.devSegment) {
    variations.push(`${domain.hostname}/${domain.devSegment}`);
  }

  // Remove duplicates and empty values
  return [...new Set(variations.filter(Boolean))];
}

function encodeDomainForFirestore(domain: string): string {
  return domain
    .replace(/:/g, "_COLON_")
    .replace(/\//g, "_SLASH_")
    .replace(/\?/g, "_QUEST_")
    .replace(/#/g, "_HASH_")
    .replace(/&/g, "_AMP_");
}

/* ===================== Main Functions ===================== */
export async function saveDomainMapping(
  storeUid: string,
  domainInput: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!domainInput || !storeUid) return;

  const db = dbAdmin();
  const domainInfo = parseDomain(domainInput);
  const variations = createDomainVariations(domainInfo);

  console.log(`[DOMAIN] Saving domain mapping: ${storeUid} -> ${domainInput}`);
  console.log(`[DOMAIN] Variations:`, variations);

  try {
    // 1. Update store document with domain info
    await db.collection("stores").doc(storeUid).set({
      domain: {
        base: domainInfo.normalized,
        hostname: domainInfo.hostname,
        isDevStore: domainInfo.isDevStore,
        devSegment: domainInfo.devSegment || null,
        variations,
        updatedAt: Date.now(),
      },
      salla: {
        domain: domainInfo.normalized, // Legacy field
      },
      updatedAt: Date.now(),
    }, { merge: true });

    // 2. Create domain documents for reverse lookup
    const batch = db.batch();

    for (const variation of variations) {
      if (!variation) continue;

      // Create both encoded and direct versions
      const encodedKey = encodeDomainForFirestore(variation);
      
      const domainData = {
        storeUid,
        domain: variation,
        originalDomain: domainInput,
        isDevStore: domainInfo.isDevStore,
        createdAt: Date.now(),
        ...metadata,
      };

      // Encoded version (safe for Firestore document IDs)
      batch.set(
        db.collection("domains").doc(encodedKey),
        domainData,
        { merge: true }
      );

      // Direct version (for exact lookups)
      if (encodedKey !== variation) {
        try {
          batch.set(
            db.collection("domains").doc(variation),
            domainData,
            { merge: true }
          );
        } catch (error) {
          // Some domains might not be valid Firestore doc IDs
          console.warn(`[DOMAIN] Could not create direct domain doc for: ${variation}`, error);
        }
      }
    }

    await batch.commit();
    console.log(`[DOMAIN] Successfully saved ${variations.length} domain variations for ${storeUid}`);

  } catch (error) {
    console.error(`[DOMAIN] Error saving domain mapping:`, error);
    throw error;
  }
}

export async function findStoreByDomain(domainInput: string): Promise<string | null> {
  if (!domainInput) return null;

  const db = dbAdmin();
  const domainInfo = parseDomain(domainInput);
  const variations = createDomainVariations(domainInfo);

  console.log(`[DOMAIN] Looking up store for: ${domainInput}`);
  console.log(`[DOMAIN] Trying variations:`, variations);

  // 1. Try direct store collection queries
  for (const variation of variations) {
    try {
      // Try salla.domain field
      const sallaQuery = await db.collection("stores")
        .where("salla.domain", "==", variation)
        .where("salla.connected", "==", true)
        .limit(1)
        .get();

      if (!sallaQuery.empty) {
        const storeUid = sallaQuery.docs[0].id;
        console.log(`[DOMAIN] Found via salla.domain: ${variation} -> ${storeUid}`);
        return storeUid;
      }

      // Try domain.base field
      const domainQuery = await db.collection("stores")
        .where("domain.base", "==", variation)
        .limit(1)
        .get();

      if (!domainQuery.empty) {
        const storeUid = domainQuery.docs[0].id;
        console.log(`[DOMAIN] Found via domain.base: ${variation} -> ${storeUid}`);
        return storeUid;
      }
    } catch (error) {
      console.warn(`[DOMAIN] Error querying stores for ${variation}:`, error);
    }
  }

  // 2. Try domains collection lookup
  for (const variation of variations) {
    try {
      const encodedKey = encodeDomainForFirestore(variation);
      
      // Try encoded version
      let domainDoc = await db.collection("domains").doc(encodedKey).get();
      if (domainDoc.exists) {
        const storeUid = domainDoc.data()?.storeUid;
        if (storeUid) {
          console.log(`[DOMAIN] Found via encoded domains: ${variation} -> ${storeUid}`);
          return storeUid;
        }
      }

      // Try direct version
      if (encodedKey !== variation) {
        domainDoc = await db.collection("domains").doc(variation).get();
        if (domainDoc.exists) {
          const storeUid = domainDoc.data()?.storeUid;
          if (storeUid) {
            console.log(`[DOMAIN] Found via direct domains: ${variation} -> ${storeUid}`);
            return storeUid;
          }
        }
      }
    } catch (error) {
      console.warn(`[DOMAIN] Error looking up domains for ${variation}:`, error);
    }
  }

  console.log(`[DOMAIN] No store found for: ${domainInput}`);
  return null;
}

export async function removeDomainMapping(storeUid: string): Promise<void> {
  if (!storeUid) return;

  const db = dbAdmin();
  
  try {
    // Get current domain info from store
    const storeDoc = await db.collection("stores").doc(storeUid).get();
    if (!storeDoc.exists) return;

    const storeData = storeDoc.data();
    const domainVariations = storeData?.domain?.variations || [];

    // Remove domain documents
    const batch = db.batch();
    
    for (const variation of domainVariations) {
      const encodedKey = encodeDomainForFirestore(variation);
      
      batch.delete(db.collection("domains").doc(encodedKey));
      
      if (encodedKey !== variation) {
        try {
          batch.delete(db.collection("domains").doc(variation));
        } catch (error) {
          // Ignore errors for invalid doc IDs
          console.debug(`[DOMAIN] Skipping invalid doc ID: ${variation}`, error);
        }
      }
    }

    await batch.commit();

    // Clear domain info from store
    await db.collection("stores").doc(storeUid).set({
      domain: null,
      salla: {
        domain: null,
      },
      updatedAt: Date.now(),
    }, { merge: true });

    console.log(`[DOMAIN] Removed domain mapping for store ${storeUid}`);

  } catch (error) {
    console.error(`[DOMAIN] Error removing domain mapping:`, error);
    throw error;
  }
}

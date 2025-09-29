import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = dbAdmin();
    
    // Get all stores for testing
    const allStores = await db.collection("stores").limit(20).get();
    
    console.log(`[TEST] Found ${allStores.size} total stores`);
    
    const stores = allStores.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        uid: data.uid,
        provider: data.provider,
        name: data.name || 'No Name',
        salla: {
          storeId: data.salla?.storeId,
          domain: data.salla?.domain,
          connected: data.salla?.connected,
          installed: data.salla?.installed,
        },
        domain: data.domain,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    const sallaStores = stores.filter(s => s.provider === "salla");
    const connectedStores = sallaStores.filter(s => s.salla.connected);

    return res.status(200).json({
      ok: true,
      summary: {
        totalStores: allStores.size,
        sallaStores: sallaStores.length,
        connectedStores: connectedStores.length,
      },
      stores: stores,
      testUrls: connectedStores.length > 0 ? {
        resolveTest: `/api/public/reviews/resolve?storeUid=${connectedStores[0].uid}`,
        widgetTest: `/?store=${connectedStores[0].uid}`,
      } : null,
    });
    
  } catch (error) {
    console.error("[TEST] Error:", error);
    return res.status(500).json({ 
      error: "Failed to fetch stores",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { dbAdmin } from "./src/lib/firebaseAdmin.js";

async function fixStores() {
  const db = dbAdmin();
  const snap = await db.collection("stores").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    await doc.ref.set({
      salla: {
        ...(data.salla || {}),
        domain: data.salla?.domain || "",
        connected: data.salla?.connected ?? false,
        installed: data.salla?.installed ?? false,
      }
    }, { merge: true });
    console.log("Fixed:", doc.id);
  }
}
fixStores();
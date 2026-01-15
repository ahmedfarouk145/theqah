// src/server/firebase-admin.ts
// 🔁 Re-export the single canonical admin instance from src/lib/firebaseAdmin.ts
export { dbAdmin as getDb, authAdmin as getAuthAdmin } from "@/lib/firebaseAdmin";

// Optional shim to satisfy older imports (no-op; lib handles singleton)
export function initFirebaseAdminIfNeeded() {
  /* noop */
}

// src/lib/firebaseAdmin.ts
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

  // cleanup for env-inlined private key
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    // اختياري: يمكنك رمي خطأ هنا لو أردت إلزام المتغيرات
    console.warn("[firebaseAdmin] Missing some service account env vars (projectId/clientEmail/privateKey).");
  }

  return cert({ projectId, clientEmail, privateKey });
}

export function initAdmin(): App {
  if (_app) return _app;

  if (!getApps().length) {
    _app = initializeApp({
      credential: buildCredential(),
    });
  } else {
    _app = getApps()[0]!;
  }

  return _app!;
}

export function dbAdmin(): Firestore {
  if (_db) return _db;

  initAdmin();
  _db = getFirestore();

  // ✅ أهم سطر: تجاهل undefined عالميًا لتفادي أخطاء Firestore
  // NOTE: يتم استدعاء settings مرة واحدة فقط.
  _db.settings({ ignoreUndefinedProperties: true });

  return _db!;
}

export function authAdmin(): Auth {
  if (_auth) return _auth;
  initAdmin();
  _auth = getAuth();
  return _auth!;
}

// src/lib/firebaseAdmin.ts
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

declare global {
  // نحفظ كل حاجة هنا علشان HMR مايعيدش التهيئة
  // eslint-disable-next-line no-var
  var __FBA__: {
    app?: App;
    db?: Firestore;
    auth?: Auth;
    settingsApplied?: boolean;
  } | undefined;
}

function state() {
  if (!globalThis.__FBA__) globalThis.__FBA__ = {};
  return globalThis.__FBA__!;
}

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
    console.warn("[firebaseAdmin] Missing some service account env vars (projectId/clientEmail/privateKey). Falling back to ADC if available.");
    // هنرجع cert حتى لو فاضي—لو عندك ADC على السيرفر هتشتغل
  }

  return cert({ projectId, clientEmail, privateKey });
}

export function initAdmin(): App {
  const s = state();
  if (s.app) return s.app;

  s.app = getApps().length
    ? getApps()[0]!
    : initializeApp({ credential: buildCredential() });

  return s.app!;
}

export function dbAdmin(): Firestore {
  const s = state();
  if (s.db) return s.db;

  const app = initAdmin();
  const db = getFirestore(app);

  // settings مرة واحدة فقط، وقبل أي استخدام
  if (!s.settingsApplied) {
    db.settings({ ignoreUndefinedProperties: true });
    s.settingsApplied = true;
  }

  s.db = db;
  return s.db!;
}

export function authAdmin(): Auth {
  const s = state();
  if (s.auth) return s.auth;
  s.auth = getAuth(initAdmin());
  return s.auth!;
}

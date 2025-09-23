// src/lib/firebaseAdmin.ts
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

export function initAdmin(): App {
  if (_app) return _app;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

  // cleanup for env-inlined private key
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!getApps().length) {
    _app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
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
  return _db!;
}

export function authAdmin(): Auth {
  if (_auth) return _auth;
  initAdmin();
  _auth = getAuth();
  return _auth!;
}

// src/lib/firebaseAdmin.ts
import * as admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

let _app: admin.app.App | null = null;

function loadCredFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const svc = JSON.parse(json);
      return {
        projectId: String(svc.project_id),
        clientEmail: String(svc.client_email),
        privateKey: String(svc.private_key ?? "").replace(/\\n/g, "\n"),
      };
    } catch {
      // ignore
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const resolved = path.isAbsolute(credPath)
        ? credPath
        : path.join(process.cwd(), credPath);
      const raw = fs.readFileSync(resolved, "utf8");
      const svc = JSON.parse(raw);
      return {
        projectId: String(svc.project_id),
        clientEmail: String(svc.client_email),
        privateKey: String(svc.private_key ?? "").replace(/\\n/g, "\n"),
      };
    } catch {
      // ignore
    }
  }

  throw new Error(
    "[firebaseAdmin] Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
  );
}

function initAdmin() {
  if (_app) return _app;

  const { projectId, clientEmail, privateKey } = loadCredFromEnv();

  if (admin.apps.length === 0) {
    _app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });

    // ⬅️ مهم: settings() مرة واحدة **بعد** initializeApp و**قبل** أي استخدام لـ Firestore
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  } else {
    _app = admin.app();
    // لا تنادي settings() هنا إطلاقًا — لأن Firestore غالبًا اتستخدم بالفعل
  }

  return _app;
}

export function dbAdmin() {
  // تأكد إن التهيئة تمت قبل جلب الـ instance
  initAdmin();
  return admin.firestore();
}

export function authAdmin() {
  return initAdmin().auth();
}

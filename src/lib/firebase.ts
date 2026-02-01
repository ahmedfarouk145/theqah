// Client SDK
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
};

const app: FirebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

// App Check is DISABLED temporarily - reCAPTCHA domain needs to be configured
// To re-enable: go to https://www.google.com/recaptcha/admin and add www.theqah.com.sa
// Then uncomment the code below
const appCheck: AppCheck | undefined = undefined;
/*
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
*/

// حاولة حفظ الجلسة محلياً
setPersistence(auth, browserLocalPersistence).catch(() => { });

export { app, auth, db, storage, appCheck };


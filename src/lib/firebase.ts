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

// Default app — powers store owner + admin dashboards
const app: FirebaseApp =
  getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

// Blog app — same Firebase project, but an isolated browser session so
// signing into the blog does not log you into the store/admin dashboards
// (and vice versa). Firebase stores each named app's auth state under a
// distinct IndexedDB key, keeping the two sessions physically independent.
const blogApp: FirebaseApp =
  getApps().find((a) => a.name === "blog") ?? initializeApp(firebaseConfig, "blog");
const blogAuth: Auth = getAuth(blogApp);

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
setPersistence(blogAuth, browserLocalPersistence).catch(() => { });

export { app, auth, db, storage, appCheck, blogApp, blogAuth };


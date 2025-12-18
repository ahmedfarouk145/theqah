import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCxgpNDnSC5gGmGh9ttVBH9DFtZdyisph8',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'theqah-d3ee0.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'theqah-d3ee0',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function getToken() {
  try {
    const userCred = await signInWithEmailAndPassword(auth, 'reviews@theqah.com.sa', 'ASWqer124');
    const token = await userCred.user.getIdToken();
    console.log('ID Token:', token);
  } catch (err) {
    console.error('Login failed:', err);
  }
}

getToken();

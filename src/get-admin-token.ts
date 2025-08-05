import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCPV-BkAqO68q0F_Rp7vDCjmoo22Y3b5fk',
  authDomain: 'thaqa-7630a.firebaseapp.com',
  projectId: 'thaqa-7630a',
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

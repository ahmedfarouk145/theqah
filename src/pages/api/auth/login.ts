// src/auth/login.ts
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase';

export async function loginUser(email: string, password: string) {
  const auth = getAuth(app);

  // تسجيل الدخول
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;

  // جلب الدور من Firestore
  const userDoc = await getDoc(doc(db, 'users', uid));
  const role = userDoc.exists() ? userDoc.data()?.role : 'user';

  // جلب التوكن
  const token = await userCredential.user.getIdToken();

  // تخزين التوكن في localStorage
  localStorage.setItem('token', token);

  return { uid, role, token };
}

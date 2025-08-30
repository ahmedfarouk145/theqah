// src/lib/auth/login.ts
import { signInWithEmailAndPassword, getAuth, type UserCredential, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase';
import { setToken, clearToken } from './tokenManager';

type Role = 'admin' | 'user';

type LoginResult = {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
  };
  role: Role;
  token: string;
};

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  try {
    const auth = getAuth(app);

    // 1) Sign in
    const userCredential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
    const user: User = userCredential.user;

    // 2) Read role from roles/{uid} where { admin: true }
    const roleDoc = await getDoc(doc(db, 'roles', user.uid));
    const role: Role = roleDoc.exists() && roleDoc.data()?.admin === true ? 'admin' : 'user';

    // 3) Get Firebase ID token (+ store with TTL)
    const tokenResult = await user.getIdTokenResult(true); // force refresh to ensure fresh claims if needed
    const expiresIn = Math.max(
      0,
      Math.floor((new Date(tokenResult.expirationTime).getTime() - Date.now()) / 1000)
    );
    setToken(tokenResult.token, expiresIn);

    return {
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
      role,
      token: tokenResult.token,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('❌ Login error:', error);
      throw new Error(error.message || 'Login failed');
    }
    throw new Error('Login failed');
  }
}

export async function logoutUser(): Promise<void> {
  try {
    const auth = getAuth(app);
    await auth.signOut();
    clearToken();
    console.log('✅ Logout successful');
  } catch (error) {
    console.error('❌ Logout error:', error);
  }
}

export function getCurrentUser() {
  const auth = getAuth(app);
  return auth.currentUser;
}

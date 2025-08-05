import { createContext, useContext, useEffect, useState } from 'react';
import { getAuth, onIdTokenChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase'; // تأكد أن db و app موجودين هنا

interface AuthContextType {
  user: User | null;
  token: string | null;
  storeName: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  storeName: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (user) {
        const idToken = await user.getIdToken();
        setUser(user);
        setToken(idToken);

        // ✅ Firestore لجلب اسم المتجر
        const snap = await getDoc(doc(db, 'stores', user.uid));
        const data = snap.data();
        setStoreName(data?.storeName || null);
      } else {
        setUser(null);
        setToken(null);
        setStoreName(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, storeName, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

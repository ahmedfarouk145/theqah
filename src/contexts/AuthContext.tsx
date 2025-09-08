import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

type StoreState = {
  storeUid: string | null;
  storeName: string | null;
  platform: string | null;
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  store: StoreState;
};

const Ctx = createContext<AuthValue>({ user: null, loading: true, store: { storeUid: null, storeName: null, platform: null } });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<StoreState>({ storeUid: null, storeName: null, platform: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setStore({ storeUid: null, storeName: null, platform: null });
        setLoading(false);
        return;
      }

      try {
        // 1) جرّب alias: stores/{user.uid}
        const aliasSnap = await getDoc(doc(db, "stores", u.uid));
        if (aliasSnap.exists()) {
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = aliasSnap.data() as any;
          const aliasOf: string | undefined = a.storeUid;
          const nameAlias = a.storeName ?? null;

          if (aliasOf) {
            const realSnap = await getDoc(doc(db, "stores", aliasOf));
            if (realSnap.exists()) {
              //eslint-disable-next-line @typescript-eslint/no-explicit-any
              const r = realSnap.data() as any;
              const s = r.salla || {};
              setStore({
                storeUid: aliasOf,
                storeName: s.storeName ?? r.storeName ?? nameAlias ?? null,
                platform: r.platform ?? "salla",
              });
              setLoading(false);
              return;
            }
          }

          // لو مفيش storeUid في alias، اعتبر نفس المستند هو المتجر (نادرًا)
          setStore({
            storeUid: u.uid,
            storeName: nameAlias,
            platform: a.platform ?? "salla",
          });
          setLoading(false);
          return;
        }

        // 2) fallback: ربما تم حفظ المتجر مباشرة على stores/salla:{id} فقط
        // في الحالة دي لا نعرف الـ id هنا؛ سيتم تمريره عبر URL بعد onboarding.
        setStore({ storeUid: null, storeName: null, platform: null });
      } catch {
        setStore({ storeUid: null, storeName: null, platform: null });
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, loading, store }), [user, loading, store]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

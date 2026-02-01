import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

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
                platform: r.provider ?? r.platform ?? "salla",
              });
              setLoading(false);
              return;
            }
          }

          // لو مفيش storeUid في alias، اعتبر نفس المستند هو المتجر (نادرًا)
          setStore({
            storeUid: u.uid,
            storeName: nameAlias,
            platform: a.provider ?? a.platform ?? "salla",
          });
          setLoading(false);
          return;
        }

        // 2) NEW: Search for store by email if no alias exists
        // Prioritize Salla/Zid connected stores
        const userEmail = u.email;
        if (userEmail) {
          // First try: Find stores where userinfo.data.context.email matches
          const storesRef = collection(db, "stores");

          // Query for stores with matching email in userinfo
          const emailQuery = query(
            storesRef,
            where("meta.userinfo.data.context.email", "==", userEmail),
            orderBy("updatedAt", "desc"),
            limit(1)
          );

          let foundStore = false;
          try {
            const emailSnap = await getDocs(emailQuery);
            if (!emailSnap.empty) {
              const storeDoc = emailSnap.docs[0];
              //eslint-disable-next-line @typescript-eslint/no-explicit-any
              const storeData = storeDoc.data() as any;
              const storeName = storeData.meta?.userinfo?.data?.merchant?.name ??
                storeData.storeName ??
                storeData.salla?.storeName ?? null;
              setStore({
                storeUid: storeDoc.id,
                storeName,
                platform: storeData.provider ?? "salla",
              });
              foundStore = true;
            }
          } catch {
            // Query might fail if index doesn't exist, try alternative
          }

          // Second try: Find stores where email field matches
          if (!foundStore) {
            try {
              const simpleEmailQuery = query(
                storesRef,
                where("email", "==", userEmail),
                where("salla.connected", "==", true),
                limit(1)
              );
              const simpleSnap = await getDocs(simpleEmailQuery);
              if (!simpleSnap.empty) {
                const storeDoc = simpleSnap.docs[0];
                //eslint-disable-next-line @typescript-eslint/no-explicit-any
                const storeData = storeDoc.data() as any;
                setStore({
                  storeUid: storeDoc.id,
                  storeName: storeData.storeName ?? storeData.salla?.storeName ?? null,
                  platform: storeData.provider ?? "salla",
                });
                foundStore = true;
              }
            } catch {
              // Index might not exist
            }
          }

          if (foundStore) {
            setLoading(false);
            return;
          }
        }

        // 3) fallback: no store found
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


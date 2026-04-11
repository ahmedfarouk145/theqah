// src/contexts/BlogAuthContext.tsx
// Parallel auth context for the blog admin area. Subscribes to the "blog"
// Firebase app's Auth instance, which uses a separate browser session from
// the main store/admin dashboard auth. Logging in here does NOT affect
// /dashboard or /admin/dashboard, and vice versa.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { blogAuth } from "@/lib/firebase";

type BlogAuthValue = {
  user: User | null;
  loading: boolean;
};

const Ctx = createContext<BlogAuthValue>({ user: null, loading: true });

export function BlogAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(blogAuth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBlogAuth() {
  return useContext(Ctx);
}

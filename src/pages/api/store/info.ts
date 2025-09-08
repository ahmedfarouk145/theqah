import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { authAdmin } from "@/lib/firebaseAdmin";
//eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ok = { ok: true; store: any };
type Err = { ok: false; error: string };

async function verify(req: NextApiRequest) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  try {
    const dec = await authAdmin().verifyIdToken(token);
    return { uid: dec.uid as string, email: (dec.email ?? null) as string | null };
  } catch { return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  try {
    const db = dbAdmin();
    const uidParam = typeof req.query.uid === "string" ? req.query.uid : undefined;

    // 1) أولوية: uid في الكويري
    let idToRead: string | null = uidParam || null;

    // 2) وإلا استخدم uid الخاص بالمستخدم (لو الهيدر موجود)
    if (!idToRead) {
      const user = await verify(req);
      if (!user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      idToRead = user.uid;
    }

    if (!idToRead) return res.status(400).json({ ok: false, error: "Missing uid" });

    // اقرأ المستند
    let snap = await db.collection("stores").doc(idToRead).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "Store not found" });

    let data = snap.data() || {};

    // لو ده alias عنده storeUid → ارجع للمستند الحقيقي
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alias = (data as any).storeUid as string | undefined;
    if (alias) {
      const real = await db.collection("stores").doc(alias).get();
      if (real.exists) {
        data = { ...(real.data() || {}), aliasOf: idToRead };
        snap = real;
      }
    }
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (data as any).salla || {};
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = s.storeName ?? (data as any).storeName ?? null;

    return res.status(200).json({
      ok: true,
      store: {
        storeUid: snap.id,
        name,
        salla: s,
        domain: s.domain ?? null,
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        platform: (data as any).platform ?? "salla",
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

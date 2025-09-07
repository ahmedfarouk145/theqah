import type { NextApiRequest, NextApiResponse } from "next";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || "Unauthorized" });
  }

  const { storeId } = req as AuthedRequest;
  if (!storeId) return res.status(400).json({ message: "Missing storeId" });

  const storeRef = doc(db, "stores", storeId);

  try {
    if (req.method === "GET") {
      const snapshot = await getDoc(storeRef);
      if (!snapshot.exists()) return res.status(200).json({ settings: {} });

      const data = snapshot.data();
      return res.status(200).json({
        settings: data?.settings || {},
      });
    }

    if (req.method === "POST") {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (req.body ?? {}) as any;
      // نتوقع { settings: { salla: { reviewTemplate: "..." } } }
      if (typeof body !== "object") return res.status(400).json({ message: "Invalid payload" });

      await setDoc(
        storeRef,
        { settings: body.settings ?? {} },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e) {
    console.error("Settings Error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

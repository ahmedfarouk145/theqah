// src/pages/api/store/settings.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";
import { StoreService } from "@/server/services/store.service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || "Unauthorized" });
  }

  const { storeId } = req as AuthedRequest;
  if (!storeId) return res.status(400).json({ message: "Missing storeId" });

  const storeService = new StoreService();

  try {
    if (req.method === "GET") {
      const settings = await storeService.getSettings(storeId);
      return res.status(200).json({ settings });
    }

    if (req.method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (req.body ?? {}) as any;
      if (typeof body !== "object") return res.status(400).json({ message: "Invalid payload" });

      await storeService.updateSettings(storeId, body.settings ?? {});
      return res.status(200).json({ ok: true });
    }

    if (req.method === "PATCH") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (req.body ?? {}) as any;
      if (typeof body !== "object") return res.status(400).json({ message: "Invalid payload" });

      const updates: string[] = [];

      if (body.certificatePosition) {
        const validPositions = ["auto", "before-reviews", "after-reviews", "footer", "floating"];
        if (!validPositions.includes(body.certificatePosition)) {
          return res.status(400).json({ message: "Invalid certificatePosition value" });
        }
        await storeService.updateSetting(storeId, "certificatePosition", body.certificatePosition);
        updates.push("certificatePosition");
      }

      if (body.widgetTheme) {
        await storeService.updateSetting(storeId, "widgetTheme", body.widgetTheme);
        updates.push("widgetTheme");
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No valid settings to update" });
      }

      return res.status(200).json({ ok: true, updated: updates });
    }

    res.setHeader("Allow", ["GET", "POST", "PATCH"]);
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e) {
    console.error("Settings Error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

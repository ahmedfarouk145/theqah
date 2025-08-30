// src/pages/api/admin/test-notify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  tryChannels,
  type Channel,
  type TryChannelsResult,
  type Attempt,
} from "@/server/messaging/send-invite";
import { verifyAdmin } from "@/utils/verifyAdmin";

type Strategy = "all" | "first_success";

type Body = {
  to?: string;
  email?: string;
  locale?: "ar" | "en";
  url?: string;
  storeName?: string;
  customerName?: string;
  /** ترتيب القنوات المطلوب (اختياري) */
  order?: Channel[];
  inviteId?: string;
  strategy?: Strategy;
};

type ApiResult = {
  ok: boolean;
  firstSuccessChannel: Channel | null;
  attempts: Attempt[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResult | { error: string; message?: string }>
) {
  try {
    await verifyAdmin(req);
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      to,
      email,
      url,
      storeName,
      customerName,
      inviteId,
      strategy,
      order,
    } = (req.body || {}) as Body;

    if (!to || !url || !storeName) {
      return res
        .status(400)
        .json({ error: "to, url, storeName are required" });
    }

    const result: TryChannelsResult = await tryChannels({
      phone: String(to),
      email: email ? String(email) : undefined,
      url: String(url),
      storeName: String(storeName),
      customerName: customerName ? String(customerName) : "عميل",
      country: "eg",
      inviteId: inviteId ? String(inviteId) : undefined,
      strategy: strategy === "first_success" ? "first_success" : "all",
      order, // ✅ بقت جزء من النوع
    });

    return res.status(200).json(result);
  } catch (error) {
    const msg = (error as Error).message || "";
    if (msg.startsWith("permission-denied")) {
      return res
        .status(403)
        .json({ error: "Forbidden", message: "ليس لديك صلاحية" });
    }
    if (msg.startsWith("unauthenticated")) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "غير مصرح" });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

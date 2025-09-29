// src/pages/api/admin/test-notify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  sendBothNow,
  type SendBothOptions,
  type Attempt,
  buildInviteSmsDefault,
} from "@/server/messaging/send-invite";
import { verifyAdmin } from "@/utils/verifyAdmin";

type Body = {
  to?: string;
  email?: string;
  url?: string;
  storeName?: string;
  customerName?: string;
  inviteId?: string;
  strategy?: "all" | "first_success";
};

type ApiResult = {
  ok: boolean;
  attempts: Array<{
    status: "fulfilled" | "rejected";
    error: string | null;
  }>;
  note?: string;
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
    } = (req.body || {}) as Body;

    if (!to || !url || !storeName) {
      return res
        .status(400)
        .json({ error: "to, url, storeName are required" });
    }

    const result = await sendBothNow({
      phone: String(to),
      email: email ? String(email) : undefined,
      url: String(url),
      storeName: String(storeName),
      customerName: customerName ? String(customerName) : "عميل",
      inviteId: inviteId ? String(inviteId) : undefined,
      perChannelTimeoutMs: 10_000,
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

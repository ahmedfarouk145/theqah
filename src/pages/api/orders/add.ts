// src/pages/api/orders/add.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyUser } from "@/utils/verifyUser";
import { OrderService, type CreateOrderInput } from "@/server/services/order.service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

    const { uid } = await verifyUser(req);

    const orderService = new OrderService();
    const result = await orderService.createOrder(uid, req.body as CreateOrderInput);

    if (!result.ok) {
      const status = result.error === 'STORE_NOT_FOUND' ? 404 :
        result.error === 'NOT_STORE_OWNER' ? 403 :
          result.error === 'MISSING_FIELDS' ? 400 : 500;
      return res.status(status).json({ ok: false, error: result.error });
    }

    return res.status(201).json({
      ok: true,
      id: result.id,
      locations: {
        root: `orders/${result.id}`,
        nested: `stores/${req.body.storeUid}/orders/${result.id}`,
      },
    });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    const status = err.status || 500;
    const message = err.message || "INTERNAL";
    console.error("orders/add error:", message);
    return res.status(status).json({ ok: false, error: message });
  }
}

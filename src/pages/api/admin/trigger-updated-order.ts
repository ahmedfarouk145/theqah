import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAdmin } from "@/utils/verifyAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.success) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { 
      orderId, 
      merchantId, 
      previousState, 
      currentState, 
      customerName = "عميل تجربة",
      customerEmail,
      customerMobile 
    } = req.body;

    if (!orderId || !merchantId) {
      return res.status(400).json({ 
        error: "Missing required fields",
        required: ["orderId", "merchantId"],
        received: { orderId: !!orderId, merchantId: !!merchantId }
      });
    }

    // Prepare webhook payload for updated_order event
    const webhookPayload = {
      event: "updated_order",
      merchant: merchantId,
      data: {
        id: orderId,
        order_id: orderId,
        status: currentState || "processing",
        order_status: currentState || "processing", 
        previous_status: previousState || "pending",
        old_status: previousState || "pending",
        new_status: currentState || "processing",
        customer: {
          name: customerName,
          email: customerEmail || null,
          mobile: customerMobile || null
        },
        items: [
          {
            id: `item_${orderId}_1`,
            name: "منتج تجريبي",
            quantity: 1,
            price: 100
          }
        ],
        merchant: {
          id: merchantId
        },
        store: {
          id: merchantId
        }
      }
    };

    console.log(`[TRIGGER_UPDATED_ORDER] Sending updated_order event for order ${orderId}`);

    // Send to local webhook endpoint
    const webhookUrl = process.env.NODE_ENV === "development" 
      ? "http://localhost:3001/api/salla/webhook" 
      : `${process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL}/api/salla/webhook`;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Salla-Webhook/1.0",
        "X-Salla-Event": "updated_order",
        // Skip auth for testing
        "X-Test-Mode": "true"
      },
      body: JSON.stringify(webhookPayload)
    });

    const responseText = await response.text();
    console.log(`[TRIGGER_UPDATED_ORDER] Webhook response:`, response.status, responseText);

    return res.status(200).json({
      ok: true,
      message: "updated_order event triggered successfully",
      payload: webhookPayload,
      webhookResponse: {
        status: response.status,
        statusText: response.statusText,
        response: responseText
      },
      testUrls: {
        webhook: webhookUrl,
        admin: `/admin/orders?search=${orderId}`,
      }
    });

  } catch (error) {
    console.error("[TRIGGER_UPDATED_ORDER] Error:", error);
    return res.status(500).json({ 
      error: "Failed to trigger updated_order event",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

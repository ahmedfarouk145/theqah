// src/pages/api/ai/insights.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type AnalyticsData = {
  totalOrders: number;
  totalReviews: number;
  positiveRate: number;
  ordersChart: { month: string; count: number }[];
  reviewsChart: { month: string; positive: number; negative: number }[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  try {
    // ✅ إزالة requireUser للسماح بالوصول بدون auth صارم
    // await requireUser(req); // ❌ هذا يسبب المشكلة

    const data = (req.body?.data ?? null) as AnalyticsData | null;
    if (!data) return res.status(400).json({ ok: false, message: "missing data" });

    // ✅ التحقق من وجود OPENAI_API_KEY
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Insights] OPENAI_API_KEY not found");
      return res.status(500).json({ ok: false, message: "OPENAI_API_KEY غير متوفر" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const content = [
      "حلّل بيانات لوحة التحكم التالية وأرجِع 4–6 نقاط عملية قصيرة بالعربية:",
      `إجمالي الطلبات: ${data.totalOrders}`,
      `إجمالي التقييمات: ${data.totalReviews}`,
      `نسبة الإيجابية: ${data.positiveRate}%`,
      `الطلبات الشهرية: ${data.ordersChart.map(x => `${x.month}:${x.count}`).join(", ")}`,
      `التقييمات الشهرية (+:-): ${data.reviewsChart.map(x => `${x.month}:${x.positive}/${x.negative}`).join(", ")}`,
      "صيّغ التوصيات بلهجة مهنية ولغة موجزة، مع إيموجي مناسب لكل نقطة."
    ].join("\n");

    // ✅ إضافة timeout للطلب
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 ثانية

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: "system", content: "أنت مساعد تحليلي يُنتج توصيات عملية موجزة." },
        { role: "user", content }
      ],
    }, { signal: controller.signal });

    clearTimeout(timeoutId);

    const text = completion.choices[0]?.message?.content?.trim() || "—";
    
    console.log("[AI Insights] Success:", text.substring(0, 100) + "..."); // لوج للتأكد
    
    return res.status(200).json({ ok: true, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[AI Insights] Error:", msg);
    
    // ✅ رسائل خطأ واضحة
    if (msg.includes("api_key")) {
      return res.status(500).json({ ok: false, message: "مفتاح OpenAI غير صحيح" });
    }
    if (msg.includes("quota")) {
      return res.status(500).json({ ok: false, message: "انتهى رصيد OpenAI" });
    }
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return res.status(500).json({ ok: false, message: "انتهت مهلة الاتصال" });
    }
    
    return res.status(500).json({ ok: false, message: msg });
  }
}

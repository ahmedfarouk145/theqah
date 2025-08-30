// src/pages/api/ai/insights.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { requireUser } from "@/server/auth/requireUser";

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
    await requireUser(req); // لو محتاج uid استخدمه هنا

    const data = (req.body?.data ?? null) as AnalyticsData | null;
    if (!data) return res.status(400).json({ ok: false, message: "missing data" });

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

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: "system", content: "أنت مساعد تحليلي يُنتج توصيات عملية موجزة." },
        { role: "user", content }
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() || "—";
    return res.status(200).json({ ok: true, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, message: msg });
  }
}

// src/server/withCors.ts
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

const ALLOW_ORIGINS = [
  "http://localhost:3000",
  "https://theqah.com.sa",
  "https://www.theqah.com.sa",
];

// التصدير المُسمّى
export function withCors(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const origin = req.headers.origin || "";

    if (ALLOW_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    return handler(req, res);
  };
}

// ✅ (اختياري) وفّر default export كمان علشان أي استيرادات قديمة ما تقعش
export default withCors;

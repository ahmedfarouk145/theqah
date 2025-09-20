import type { NextApiRequest, NextApiResponse } from "next";
import { runWorkerOnce } from "@/worker/outbox-worker";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = req.headers["x-cron-secret"] || req.query.key;
  if (!key || key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const processed = await runWorkerOnce(50);
  return res.status(200).json({ ok: true, processed });
}

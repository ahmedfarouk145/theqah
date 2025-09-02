// src/pages/r/[code].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { expandShortLink } from "@/server/short-links";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).send("missing_code");

  try {
    const dest = await expandShortLink(code);
    if (!dest) return res.status(404).send("short_link_not_found_or_invalid");

    res.writeHead(302, { Location: dest });
    res.end();
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    res.status(500).send(e?.message || "internal_error");
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
import { log } from "@/lib/logger";
import { handleApiError } from "@/server/core";
import { RepositoryFactory } from "@/server/repositories";
import { sallaTokenService } from "@/server/services/salla-token.service";

// Sequential, time-budgeted refresh of every Salla store. Most stores are
// skipped cheaply (fresh); only stale ones make a Salla call.
export const config = {
  maxDuration: 300,
};

const TIME_BUDGET_MS = 270_000;

/**
 * Cron: keep-alive token refresher (the SINGLE writer of Salla OAuth tokens).
 *
 * Salla refresh tokens are single-use, rotating, and expire after 30 days; an
 * access token lasts 14 days. The backfill crons used to refresh on demand,
 * which (a) raced each other and made Salla revoke both tokens, and (b) never
 * fired for idle stores, so their refresh token silently expired (the
 * "dead-token" stores we found). This cron proactively rotates every store's
 * token once it's older than the keep-alive window (~10 days), so:
 *   - the rotating refresh token stays far inside Salla's 30-day life, and
 *   - the backfill crons always find a still-valid token and never trigger a
 *     competing refresh — eliminating the revoking race.
 *
 * Stores whose grant is already revoked (oauth.needsReauth) are skipped — they
 * can only be recovered by a merchant reinstall.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Invalid cron authorization" });
  }

  try {
    const startedAt = Date.now();
    log("info", "refresh-tokens (keep-alive) started", { scope: "cron" });

    const owners = await RepositoryFactory.getOwnerRepository().findAll();
    const sallaOwners = owners.filter(
      (o) => (o.provider === "salla" || o.uid?.startsWith("salla:")) && o.oauth?.refresh_token,
    );

    const results = {
      total: sallaOwners.length,
      refreshed: 0,
      fresh: 0,
      needsReauth: 0,
      revoked: 0,
      failed: 0,
      stoppedEarly: false,
    };

    for (const owner of sallaOwners) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS) {
        results.stoppedEarly = true;
        log("warn", "refresh-tokens stopped early (time budget)", {
          scope: "cron",
          processed: results.refreshed + results.fresh + results.needsReauth + results.revoked + results.failed,
          total: results.total,
        });
        break;
      }

      try {
        const r = await sallaTokenService.refreshIfStale(owner.uid);
        if (r.refreshed) results.refreshed++;
        else if (r.skipped === "fresh") results.fresh++;
        else if (r.skipped === "needs-reauth") results.needsReauth++;
        else if (r.skipped === "revoked") results.revoked++;
        else results.failed++;
      } catch (e) {
        results.failed++;
        log("error", `refresh-tokens failed for ${owner.uid}`, {
          scope: "cron",
          storeUid: owner.uid,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    log("info", "refresh-tokens (keep-alive) completed", { scope: "cron", ...results });
    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    handleApiError(res, error);
  }
}

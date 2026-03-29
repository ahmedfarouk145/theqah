import fs from "fs";
import path from "path";
import process from "process";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function loadEnvFiles(files) {
  for (const file of files) {
    const resolved = path.resolve(process.cwd(), file);
    if (!fs.existsSync(resolved)) continue;

    const content = fs.readFileSync(resolved, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\\n/g, "\n");

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function initDb() {
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  ).trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  const app =
    getApps()[0] ||
    initializeApp(
      projectId && clientEmail && privateKey
        ? {
            projectId,
            credential: cert({ projectId, clientEmail, privateKey }),
          }
        : {
            ...(projectId ? { projectId } : {}),
            credential: applicationDefault(),
          }
    );

  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRawEndDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Date.parse(`${trimmed}T23:59:59.999Z`);
  }

  const parsed = Date.parse(trimmed.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatReadableDate(value) {
  const epochMs = numOrNull(value);
  if (epochMs == null) return null;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${formatter.format(epochMs)} KSA`;
}

function normalizeDomain(store) {
  return firstNonEmpty(
    store?.url,
    store?.meta?.userinfo?.data?.store?.url,
    store?.meta?.userinfo?.data?.merchant?.url,
    store?.domain?.base,
    store?.salla?.domain,
    store?.zid?.domain,
    store?.merchant?.domain,
    store?.salla?.url,
    store?.merchant?.url
  );
}

function extractRawSubscriptionEntry(store) {
  const raw = store?.subscription?.raw;
  const rawRecord = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rawData = rawRecord?.data;

  if (Array.isArray(rawData) && rawData.length > 0) {
    return rawData[0] && typeof rawData[0] === "object" ? rawData[0] : {};
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return raw[0] && typeof raw[0] === "object" ? raw[0] : {};
  }

  return rawRecord;
}

function extractRawSubscriptionStatus(store) {
  const entry = extractRawSubscriptionEntry(store);
  const status = firstNonEmpty(
    entry?.status,
    entry?.subscription_status,
    entry?.subscription?.status
  );
  return status ? status.toLowerCase() : null;
}

function classifyTier(store, now) {
  const planId = firstNonEmpty(store?.subscription?.planId, store?.plan?.code);
  const active = store?.plan?.active === true;
  const expiresAt = numOrNull(store?.subscription?.expiresAt);
  const expiredAt =
    numOrNull(store?.subscription?.expiredAt) ??
    numOrNull(store?.plan?.expiredAt);
  const hasFutureExpiry = typeof expiresAt === "number" && expiresAt > now;

  if (
    store?.plan?.active === false ||
    (typeof expiresAt === "number" && expiresAt <= now) ||
    (!hasFutureExpiry && typeof expiredAt === "number")
  ) {
    return "cancelled";
  }

  if (planId === "TRIAL") return "trial";
  if (planId === "PAID_MONTHLY") return "monthly";
  if (planId === "PAID_ANNUAL") return "yearly";

  if (active && !planId) return "trial";
  return null;
}

function toRow(docId, store) {
  const metaUserinfo = store?.meta?.userinfo || {};
  const metaUserinfoData = metaUserinfo?.data || {};
  const merchantMeta = metaUserinfo?.merchant || {};
  const merchantMetaData = metaUserinfoData?.merchant || {};
  const storeMeta = metaUserinfo?.store || {};
  const storeMetaData = metaUserinfoData?.store || {};
  const contextMetaData = metaUserinfoData?.context || {};
  const phone =
    firstNonEmpty(
      store?.phone,
      store?.mobile,
      metaUserinfoData?.phone,
      metaUserinfoData?.mobile,
      store?.merchant?.phone,
      store?.merchant?.mobile,
      merchantMetaData?.phone,
      merchantMetaData?.mobile,
      merchantMeta?.phone,
      merchantMeta?.mobile,
      contextMetaData?.phone,
      contextMetaData?.mobile
    ) || null;

  return {
    number: null,
    storeUid: firstNonEmpty(store?.uid, docId) || docId,
    provider: firstNonEmpty(store?.provider) || null,
    storeName:
      firstNonEmpty(
        store?.storeName,
        store?.name,
        store?.salla?.name,
        store?.salla?.storeName,
        store?.zid?.storeName,
        storeMetaData?.name,
        storeMeta?.name,
        merchantMetaData?.name,
        merchantMeta?.name,
        store?.merchant?.name
      ) || null,
    phone,
    domain: normalizeDomain(store) || null,
    connected: Boolean(store?.salla?.connected ?? store?.zid?.connected),
    installed: Boolean(store?.salla?.installed ?? store?.zid?.installed),
    planId: firstNonEmpty(store?.subscription?.planId, store?.plan?.code) || null,
    planActive: store?.plan?.active === true,
    subscriptionStartedAt: formatReadableDate(store?.subscription?.startedAt),
    subscriptionExpiresAt: formatReadableDate(getEffectiveExpiresAt(store)),
    subscriptionExpiredAt: formatReadableDate(
      numOrNull(store?.subscription?.expiredAt) ??
        numOrNull(store?.plan?.expiredAt)
    ),
    subscriptionSyncedAt: formatReadableDate(store?.subscription?.syncedAt),
    createdAt: formatReadableDate(store?.createdAt),
    updatedAt: formatReadableDate(store?.updatedAt),
  };
}

function usage() {
  console.log(
    "Usage: node scripts/export-subscription-tiers.mjs [--out <file>] [--provider <provider>] [--mode <default|salla-dashboard>]"
  );
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outArg = outIndex >= 0 ? args[outIndex + 1] : "";
const providerIndex = args.indexOf("--provider");
const providerArg = providerIndex >= 0 ? args[providerIndex + 1] : "";
const modeIndex = args.indexOf("--mode");
const modeArg = modeIndex >= 0 ? args[modeIndex + 1] : "default";

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

if (outIndex >= 0 && !outArg) {
  throw new Error("Missing value for --out");
}
if (providerIndex >= 0 && !providerArg) {
  throw new Error("Missing value for --provider");
}
if (modeIndex >= 0 && !modeArg) {
  throw new Error("Missing value for --mode");
}

function getEffectiveExpiresAt(store) {
  return (
    numOrNull(store?.subscription?.expiresAt) ??
    parseRawEndDate(store?.subscription?.raw?.end_date)
  );
}

function classifyTierForSallaDashboard(store, now) {
  const planId = firstNonEmpty(store?.subscription?.planId, store?.plan?.code);
  const active = store?.plan?.active === true;
  const effectiveExpiresAt = getEffectiveExpiresAt(store);
  const rawStatus = extractRawSubscriptionStatus(store);

  if (["cancelled", "canceled", "expired", "inactive"].includes(rawStatus || "")) {
    return "cancelled";
  }

  if (rawStatus === "active") {
    if (planId === "TRIAL") return "trial";
    if (planId === "PAID_MONTHLY") return "monthly";
    if (planId === "PAID_ANNUAL") return "yearly";
    return null;
  }

  if (planId === "TRIAL") {
    return active ? "trial" : "cancelled";
  }

  if (planId === "PAID_MONTHLY" || planId === "PAID_ANNUAL") {
    if (!active) {
      return "cancelled";
    }

    if (
      typeof effectiveExpiresAt === "number" &&
      effectiveExpiresAt <= now
    ) {
      return "cancelled";
    }

    return planId === "PAID_ANNUAL" ? "yearly" : "monthly";
  }

  return null;
}

async function main() {
  loadEnvFiles([".env.local", ".env.production.local", ".env"]);
  const db = initDb();
  const now = Date.now();
  const fetchedAt = new Date(now).toISOString();
  const providerFilter = providerArg.trim().toLowerCase();
  const mode = modeArg.trim().toLowerCase();

  let query = db.collection("stores");
  if (providerFilter) {
    query = query.where("provider", "==", providerFilter);
  }
  const storesSnap = await query.get();

  const tiers = {
    trial: [],
    monthly: [],
    yearly: [],
    cancelled: [],
  };

  for (const doc of storesSnap.docs) {
    const store = doc.data() || {};
    const tier =
      mode === "salla-dashboard"
        ? classifyTierForSallaDashboard(store, now)
        : classifyTier(store, now);
    if (!tier) continue;

    tiers[tier].push(toRow(doc.id, store));
  }

  for (const rows of Object.values(tiers)) {
    rows.sort((a, b) => {
      const nameA = a.storeName || a.storeUid;
      const nameB = b.storeName || b.storeUid;
      return nameA.localeCompare(nameB, "ar") || a.storeUid.localeCompare(b.storeUid);
    });
  }

  for (const rows of Object.values(tiers)) {
    rows.forEach((row, index) => {
      row.number = index + 1;
    });
  }

  const payload = {
    ok: true,
    fetchedAt: formatReadableDate(now),
    fetchedAtIso: fetchedAt,
    filter: {
      provider: providerFilter || "all",
      mode,
    },
    counts: {
      trial: tiers.trial.length,
      monthly: tiers.monthly.length,
      yearly: tiers.yearly.length,
      cancelled: tiers.cancelled.length,
      paidSubscribers: tiers.monthly.length + tiers.yearly.length,
      activeIncludingTrial:
        tiers.trial.length + tiers.monthly.length + tiers.yearly.length,
      total:
        tiers.trial.length +
        tiers.monthly.length +
        tiers.yearly.length +
        tiers.cancelled.length,
    },
    tiers,
  };

  const outPath =
    outArg ||
    path.join(
      process.cwd(),
      "output",
      `subscription-tiers-${providerFilter || "all"}-${mode}-${fetchedAt.replace(/[:.]/g, "-")}.json`
    );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(JSON.stringify({ ok: true, outPath, counts: payload.counts }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\\n/g, "\n");

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function initDb() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
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

function getSubscriptionInfo(store) {
  const planId = firstNonEmpty(store?.subscription?.planId, store?.plan?.code);
  const expiresAt =
    numOrNull(store?.subscription?.expiresAt) ??
    numOrNull(store?.subscription?.expiredAt) ??
    numOrNull(store?.plan?.expiresAt);
  const planActive = store?.plan?.active === true;
  return { planId, expiresAt, planActive };
}

function isSubscribed(store, now) {
  const { planId, expiresAt, planActive } = getSubscriptionInfo(store);
  if (planActive) return true;
  if (typeof expiresAt === "number" && expiresAt > now) return true;
  if (planId) return true; // fallback for older docs that only store plan ID
  return false;
}

function getStatus(store, now) {
  const { planId, expiresAt, planActive } = getSubscriptionInfo(store);
  if (typeof expiresAt === "number") return expiresAt > now ? "active_by_expiry" : "expired";
  if (planActive) return "active_by_plan";
  if (planId) return "has_plan_id";
  return "unknown";
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function printUsage() {
  console.log(`Usage: node scripts/export-subscribed-stores.mjs [--out <file>] [--paid-only]`);
}

const args = process.argv.slice(2);
const paidOnly = args.includes("--paid-only");
const outIndex = args.indexOf("--out");
const outArg = outIndex >= 0 ? args[outIndex + 1] : "";
if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}
if (outIndex >= 0 && !outArg) {
  throw new Error("Missing value for --out");
}

async function main() {
  loadEnvFiles([".env.local", ".env.production.local", ".env"]);
  const db = initDb();
  const now = Date.now();

  const [storesSnap, ownersSnap] = await Promise.all([
    db.collection("stores").get(),
    db.collection("owners").get(),
  ]);

  const ownersById = new Map(ownersSnap.docs.map((d) => [d.id, d.data() || {}]));

  const rows = [];
  for (const doc of storesSnap.docs) {
    const store = doc.data() || {};
    if (!isSubscribed(store, now)) continue;

    const { planId, expiresAt } = getSubscriptionInfo(store);
    if (paidOnly && (!planId || planId.toUpperCase() === "TRIAL")) continue;

    const owner = ownersById.get(doc.id) || ownersById.get(store.uid) || {};
    const metaUserinfo = store?.meta?.userinfo || {};
    const metaUserinfoData = metaUserinfo?.data || {};
    const merchantMeta = metaUserinfo?.merchant || {};
    const merchantMetaData = metaUserinfoData?.merchant || {};
    const storeMeta = metaUserinfo?.store || {};
    const storeMetaData = metaUserinfoData?.store || {};
    const contextMetaData = metaUserinfoData?.context || {};

    const contactName = firstNonEmpty(
      owner.name,
      owner.fullName,
      owner.displayName,
      store?.owner?.name,
      metaUserinfoData?.name,
      store?.contactName,
      store?.merchantName,
      store?.merchant?.contactName,
      store?.merchant?.ownerName,
      merchantMetaData?.name,
      merchantMeta?.name,
      store?.merchant?.name
    );

    const phone = firstNonEmpty(
      owner.phone,
      owner.mobile,
      store?.phone,
      store?.mobile,
      metaUserinfoData?.phone,
      metaUserinfoData?.mobile,
      store?.merchant?.phone,
      store?.merchant?.mobile,
      contextMetaData?.phone,
      contextMetaData?.mobile,
      merchantMetaData?.phone,
      merchantMetaData?.mobile,
      merchantMeta?.phone,
      merchantMeta?.mobile
    );

    const storeName = firstNonEmpty(
      store.storeName,
      store.name,
      store?.salla?.name,
      merchantMetaData?.name,
      store?.merchant?.storeName,
      store?.salla?.storeName,
      store?.zid?.storeName,
      storeMetaData?.name,
      storeMeta?.name,
      store?.merchant?.name
    );

    rows.push({
      storeUid: firstNonEmpty(store.uid, doc.id) || doc.id,
      provider: firstNonEmpty(store.provider),
      storeName,
      contactName,
      phone,
      planId,
      status: getStatus(store, now),
      expiresAt: typeof expiresAt === "number" ? new Date(expiresAt).toISOString() : "",
    });
  }

  rows.sort((a, b) => a.storeName.localeCompare(b.storeName, "ar") || a.storeUid.localeCompare(b.storeUid));

  const headers = ["storeUid", "provider", "storeName", "contactName", "phone", "planId", "status", "expiresAt"];
  const csv = [headers.join(",")]
    .concat(rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")))
    .join("\n");

  const outPath =
    outArg ||
    path.join(
      process.cwd(),
      "output",
      `subscribed-stores-${new Date().toISOString().replace(/[:.]/g, "-")}${paidOnly ? "-paid" : ""}.csv`
    );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, "utf8");

  console.log(JSON.stringify({ ok: true, count: rows.length, paidOnly, outPath }, null, 2));
  rows.slice(0, 20).forEach((r) => {
    console.log(`${r.storeName || "-"} | ${r.contactName || "-"} | ${r.phone || "-"} | ${r.planId || "-"} | ${r.storeUid}`);
  });
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});

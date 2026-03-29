import fs from 'fs';
import path from 'path';
import process from 'process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULTS = {
  envFiles: ['.env.local', '.env.production.local', '.env'],
  outFile: path.join('output', 'admin-store-classification-audit.json'),
};

function printHelp() {
  console.log(`
Usage:
  node scripts/audit-admin-store-classification.mjs [options]

Options:
  --out <file>         Write JSON report to file (default: ${DEFAULTS.outFile})
  --help               Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    out: DEFAULTS.outFile,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }

    if (arg === '--out') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --out');
      }
      opts.out = next;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

function loadEnvFiles(files) {
  for (const file of files) {
    const resolved = path.resolve(process.cwd(), file);
    if (!fs.existsSync(resolved)) continue;

    const content = fs.readFileSync(resolved, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

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

      value = value.replace(/\\n/g, '\n');
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function initDb() {
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ''
  ).trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();

  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

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
          },
    );

  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function isAliasStore(docId, data) {
  return typeof data.storeUid === 'string' && data.storeUid !== docId;
}

function inferProvider(docId, data, salla, zid) {
  const explicit = firstString(data.provider, data.platform).toLowerCase();
  if (explicit === 'salla' || explicit === 'zid') {
    return explicit;
  }

  const uid = firstString(data.uid);
  if (docId.startsWith('zid:') || uid.startsWith('zid:')) {
    return 'zid';
  }
  if (docId.startsWith('salla:') || uid.startsWith('salla:')) {
    return 'salla';
  }

  const hasZidData = Boolean(
    zid.storeId ??
      zid.connected ??
      zid.installed ??
      zid.domain,
  );
  if (hasZidData) {
    return 'zid';
  }

  const hasSallaData = Boolean(
    salla.storeId ??
      salla.connected ??
      salla.installed ??
      salla.domain,
  );
  if (hasSallaData) {
    return 'salla';
  }

  return 'unknown';
}

function getStoreName(docId, data) {
  const merchant = asRecord(data.merchant);
  const salla = asRecord(data.salla);
  const zid = asRecord(data.zid);
  const meta = asRecord(data.meta);
  const userinfo = asRecord(meta.userinfo);
  const payload = asRecord(userinfo.data || userinfo.context);
  const payloadMerchant = asRecord(payload.merchant);
  const payloadStore = asRecord(payload.store);

  return (
    firstString(
      payloadMerchant.name,
      payloadStore.name,
      merchant.name,
      data.storeName,
      data.name,
      salla.storeName,
      zid.storeName,
      data.uid,
      docId,
    ) || docId
  );
}

function getStoreDomain(data) {
  const domain = data.domain;
  if (typeof domain === 'string') return domain;

  const domainRecord = asRecord(domain);
  const salla = asRecord(data.salla);
  const zid = asRecord(data.zid);
  const merchant = asRecord(data.merchant);

  return firstString(domainRecord.base, salla.domain, zid.domain, merchant.domain) || null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  loadEnvFiles(DEFAULTS.envFiles);
  const db = initDb();
  const snap = await db.collection('stores').get();

  const counts = {
    allDocs: snap.size,
    aliasDocs: 0,
    nonAliasDocs: 0,
    salla: 0,
    zid: 0,
    unknown: 0,
  };

  const unknownStores = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (isAliasStore(doc.id, data)) {
      counts.aliasDocs += 1;
      continue;
    }

    counts.nonAliasDocs += 1;
    const provider = inferProvider(doc.id, data, asRecord(data.salla), asRecord(data.zid));
    counts[provider] += 1;

    if (provider === 'unknown') {
      unknownStores.push({
        id: doc.id,
        uid: firstString(data.uid) || null,
        name: getStoreName(doc.id, data),
        domain: getStoreDomain(data),
        providerField: firstString(data.provider, data.platform) || null,
        connected: Boolean(
          asRecord(data.salla).connected ??
            asRecord(data.zid).connected ??
            data.connected,
        ),
      });
    }
  }

  unknownStores.sort((left, right) => left.name.localeCompare(right.name, 'ar'));

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    counts,
    unknownStores,
  };

  const outPath = path.resolve(process.cwd(), opts.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});

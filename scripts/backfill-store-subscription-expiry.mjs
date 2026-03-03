import fs from 'fs';
import path from 'path';
import process from 'process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const DEFAULTS = {
  pageSize: 500,
  envFiles: ['.env.local', '.env.production.local', '.env'],
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SECONDS_EPOCH = 1_000_000_000;
const MAX_SECONDS_EPOCH = 9_999_999_999;

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill-store-subscription-expiry.mjs [options]

Options:
  --apply              Apply updates (default is dry-run only)
  --from-salla         Validate/derive expiry from live Salla user/info when possible
  --out <file>         Write report JSON to file
  --page-size <n>      Firestore pagination size (default: ${DEFAULTS.pageSize})
  --project-id <id>    Override Firebase project ID
  --env-file <file>    Load additional env file (repeatable)
  --no-env-load        Do not auto-load env files
  --help               Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    fromSalla: false,
    out: '',
    pageSize: DEFAULTS.pageSize,
    projectId: '',
    envFiles: [],
    noEnvLoad: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--apply') {
      opts.apply = true;
      continue;
    }
    if (arg === '--from-salla') {
      opts.fromSalla = true;
      continue;
    }
    if (arg === '--no-env-load') {
      opts.noEnvLoad = true;
      continue;
    }

    const readValue = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return next;
    };

    if (arg === '--out') {
      opts.out = readValue();
      continue;
    }
    if (arg === '--project-id') {
      opts.projectId = readValue();
      continue;
    }
    if (arg === '--env-file') {
      opts.envFiles.push(readValue());
      continue;
    }
    if (arg === '--page-size') {
      opts.pageSize = Number(readValue());
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(opts.pageSize) || opts.pageSize <= 0) {
    throw new Error('--page-size must be a positive integer');
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

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\\n/g, '\n');

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function buildFirebaseInit(projectIdOverride) {
  const projectId =
    (projectIdOverride ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
      authMode: 'service_account_env',
    };
  }

  return {
    projectId: projectId || undefined,
    credential: applicationDefault(),
    authMode: 'application_default_credentials',
  };
}

function initDb(projectIdOverride) {
  const init = buildFirebaseInit(projectIdOverride);
  const app =
    getApps()[0] ||
    initializeApp({
      credential: init.credential,
      ...(init.projectId ? { projectId: init.projectId } : {}),
    });

  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  return {
    db,
    authMode: init.authMode,
    resolvedProjectId: app.options.projectId || init.projectId || 'unknown',
  };
}

function normalizeEpochMs(value) {
  if (value >= MIN_SECONDS_EPOCH && value <= MAX_SECONDS_EPOCH) {
    return value * 1000;
  }
  return value;
}

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDateToEpochMs(value) {
  const numeric = toFiniteNumber(value);
  if (numeric !== null) return normalizeEpochMs(numeric);

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = DATE_ONLY_PATTERN.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEndDateToEpochMs(value) {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value.trim())) {
    const parsed = Date.parse(`${value.trim()}T23:59:59.999Z`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return parseDateToEpochMs(value);
}

function toIsoOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return null;
}

function shouldUpdateNumber(currentValue, nextValue) {
  if (typeof nextValue !== 'number' || !Number.isFinite(nextValue)) return false;
  if (typeof currentValue !== 'number' || !Number.isFinite(currentValue)) return true;
  return Math.abs(currentValue - nextValue) > 60 * 1000; // 1 minute threshold
}

function parseSallaStatus(statusRaw) {
  const normalized = firstString(statusRaw).toLowerCase();
  if (!normalized) return '';
  return normalized;
}

function buildOutputPath(outArg) {
  if (outArg) return path.resolve(process.cwd(), outArg);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'output', `stores-subscription-backfill-${timestamp}.json`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  if (!opts.noEnvLoad) {
    loadEnvFiles(opts.envFiles.length ? opts.envFiles : DEFAULTS.envFiles);
  }

  const { db, authMode, resolvedProjectId } = initDb(opts.projectId);
  const now = Date.now();

  let lastDoc = null;
  let scanned = 0;
  let changed = 0;

  const report = {
    mode: opts.apply ? 'apply' : 'dry_run',
    nowIso: new Date(now).toISOString(),
    projectId: resolvedProjectId,
    authMode,
    scanned: 0,
    changed: 0,
    stats: {
      backfilledStartedAt: 0,
      backfilledExpiresAt: 0,
      updatedExpiresAtFromSalla: 0,
      deactivatedExpiredStores: 0,
      setExpiredAt: 0,
      setPlanExpiredAt: 0,
      activatedFromSalla: 0,
      sallaChecked: 0,
      sallaOk: 0,
      sallaUnauthorized: 0,
      sallaMissingOwner: 0,
      sallaMissingToken: 0,
      sallaNoEndDate: 0,
      sallaRequestErrors: 0,
    },
    updates: [],
  };

  console.log(`[backfill] project=${resolvedProjectId} auth=${authMode} mode=${report.mode}`);

  while (true) {
    let query = db.collection('stores').orderBy(FieldPath.documentId()).limit(opts.pageSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data() || {};
      const subscription = data.subscription || {};
      const raw = subscription.raw && typeof subscription.raw === 'object' ? subscription.raw : {};
      const plan = data.plan || {};
      const provider = String(data.provider || '').toLowerCase();

      const currentStartedAt =
        typeof subscription.startedAt === 'number' && Number.isFinite(subscription.startedAt)
          ? normalizeEpochMs(subscription.startedAt)
          : null;
      const currentExpiresAt =
        typeof subscription.expiresAt === 'number' && Number.isFinite(subscription.expiresAt)
          ? normalizeEpochMs(subscription.expiresAt)
          : null;

      const rawStartedAt = parseDateToEpochMs(raw.start_date ?? raw.started_at ?? raw.created_at);
      const rawExpiresAt = parseEndDateToEpochMs(raw.end_date ?? raw.expires_at ?? raw.expired_at);
      let sallaExpiresAt = null;
      let sallaStatus = '';
      let sallaSource = null;
      const isSallaStore = provider === 'salla' && doc.id.startsWith('salla:');

      if (opts.fromSalla && isSallaStore) {
        report.stats.sallaChecked += 1;
        const ownerSnap = await db.collection('owners').doc(doc.id).get();
        if (!ownerSnap.exists) {
          report.stats.sallaMissingOwner += 1;
        } else {
          const owner = ownerSnap.data() || {};
          const token = firstString(owner?.oauth?.access_token);

          if (!token) {
            report.stats.sallaMissingToken += 1;
          } else {
            try {
              const response = await fetch('https://accounts.salla.sa/oauth2/user/info', {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json',
                },
              });

              if (response.status === 401) {
                report.stats.sallaUnauthorized += 1;
              } else if (!response.ok) {
                report.stats.sallaRequestErrors += 1;
              } else {
                const body = await response.json();
                const dataNode = firstObject(body?.data, body);
                const merchant = firstObject(dataNode?.merchant);
                const subscriptionNode = firstObject(merchant?.subscription);
                sallaStatus = parseSallaStatus(subscriptionNode?.status);
                sallaExpiresAt = parseEndDateToEpochMs(
                  subscriptionNode?.end_date ?? subscriptionNode?.expires_at ?? subscriptionNode?.expired_at
                );
                sallaSource = {
                  status: sallaStatus || null,
                  endDateRaw: subscriptionNode?.end_date ?? null,
                };
                report.stats.sallaOk += 1;
                if (sallaExpiresAt === null) report.stats.sallaNoEndDate += 1;
              }
            } catch {
              report.stats.sallaRequestErrors += 1;
            }
          }
        }
      }

      const updates = {};
      const reasons = [];
      const allowRawExpiryBackfill = !(opts.fromSalla && isSallaStore);

      if (currentStartedAt === null && rawStartedAt !== null) {
        updates['subscription.startedAt'] = rawStartedAt;
        reasons.push('backfill_startedAt_from_raw_start_date');
        report.stats.backfilledStartedAt += 1;
      }

      if (allowRawExpiryBackfill && currentExpiresAt === null && rawExpiresAt !== null) {
        updates['subscription.expiresAt'] = rawExpiresAt;
        reasons.push('backfill_expiresAt_from_raw_end_date');
        report.stats.backfilledExpiresAt += 1;
      }

      if (opts.fromSalla && shouldUpdateNumber(currentExpiresAt, sallaExpiresAt)) {
        updates['subscription.expiresAt'] = sallaExpiresAt;
        reasons.push('update_expiresAt_from_salla_userinfo');
        report.stats.updatedExpiresAtFromSalla += 1;
      }

      const effectiveExpiresAt =
        typeof updates['subscription.expiresAt'] === 'number'
          ? updates['subscription.expiresAt']
          : currentExpiresAt;

      const isPlanActive = plan.active === true;
      const statusIndicatesInactive = ['expired', 'cancelled', 'canceled', 'inactive', 'suspended'].includes(sallaStatus);
      const statusIndicatesActive = ['active', 'trial'].includes(sallaStatus);
      const shouldDeactivateBySalla = opts.fromSalla && (statusIndicatesInactive || (typeof sallaExpiresAt === 'number' && sallaExpiresAt <= now));
      const shouldActivateBySalla = opts.fromSalla && statusIndicatesActive && typeof sallaExpiresAt === 'number' && sallaExpiresAt > now;

      if ((typeof effectiveExpiresAt === 'number' && effectiveExpiresAt <= now && isPlanActive) || (isPlanActive && shouldDeactivateBySalla)) {
        updates['plan.active'] = false;
        reasons.push(shouldDeactivateBySalla ? 'deactivate_plan_from_salla_status' : 'deactivate_plan_active_but_expired');
        report.stats.deactivatedExpiredStores += 1;

        if (!(typeof subscription.expiredAt === 'number' && Number.isFinite(subscription.expiredAt))) {
          updates['subscription.expiredAt'] = effectiveExpiresAt;
          reasons.push('set_subscription_expiredAt');
          report.stats.setExpiredAt += 1;
        }

        if (!(typeof plan.expiredAt === 'number' && Number.isFinite(plan.expiredAt))) {
          updates['plan.expiredAt'] = effectiveExpiresAt;
          reasons.push('set_plan_expiredAt');
          report.stats.setPlanExpiredAt += 1;
        }
      }

      if (!isPlanActive && shouldActivateBySalla) {
        updates['plan.active'] = true;
        reasons.push('activate_plan_from_salla_status');
        report.stats.activatedFromSalla += 1;
      }

      if (Object.keys(updates).length > 0) {
        changed += 1;
        const updatePayload = {
          ...updates,
          updatedAt: now,
        };

        report.updates.push({
          id: doc.id,
          reasons,
          updates: updatePayload,
          before: {
            startedAt: currentStartedAt,
            startedAtIso: toIsoOrNull(currentStartedAt),
            expiresAt: currentExpiresAt,
            expiresAtIso: toIsoOrNull(currentExpiresAt),
            planActive: plan.active === true,
            rawStartDate: raw.start_date ?? null,
            rawEndDate: raw.end_date ?? null,
            sallaLive: sallaSource,
          },
        });

        if (opts.apply) {
          await doc.ref.update(updatePayload);
        }
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
    console.log(`[backfill] scanned=${scanned} changed=${changed}`);
    if (snap.size < opts.pageSize) break;
  }

  report.scanned = scanned;
  report.changed = changed;

  const outputPath = buildOutputPath(opts.out);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    mode: report.mode,
    scanned: report.scanned,
    changed: report.changed,
    outputPath,
    stats: report.stats,
  }, null, 2));
}

main().catch((error) => {
  console.error('[backfill] failed:', error?.message || error);
  process.exit(1);
});

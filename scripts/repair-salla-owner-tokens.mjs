import fs from 'fs';
import path from 'path';
import process from 'process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULTS = {
  envFiles: ['.env.local', '.env.production.local', '.env'],
  outFile: path.join('output', 'salla-token-repair-report.json'),
};

function printHelp() {
  console.log(`
Usage:
  node scripts/repair-salla-owner-tokens.mjs [options]

Options:
  --apply              Persist repaired tokens back to owners/{storeUid}
  --out <file>         Write report JSON to file (default: ${DEFAULTS.outFile})
  --help               Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    out: DEFAULTS.outFile,
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

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizeEpochSeconds(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value > 1e12 ? Math.floor(value / 1000) : value;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isAliasStore(docId, data) {
  return typeof data.storeUid === 'string' && data.storeUid !== docId;
}

function getStoreName(storeUid, storeData) {
  const meta = asRecord(storeData.meta);
  const userinfo = asRecord(meta.userinfo);
  const payload = asRecord(userinfo.data || userinfo.context);
  const merchant = asRecord(payload.merchant);
  const store = asRecord(payload.store);
  const storeMerchant = asRecord(storeData.merchant);
  const salla = asRecord(storeData.salla);

  return (
    firstString(
      merchant.name,
      store.name,
      storeMerchant.name,
      storeData.storeName,
      storeData.name,
      salla.storeName,
      salla.name,
    ) || storeUid
  );
}

function getStoreDomain(storeData) {
  const domain = storeData.domain;
  const domainRecord = asRecord(domain);
  const salla = asRecord(storeData.salla);
  const merchant = asRecord(storeData.merchant);
  return firstString(domainRecord.base, salla.domain, merchant.domain) || null;
}

function extractOwnerTokens(ownerData) {
  const oauth = asRecord(ownerData.oauth);
  return {
    accessToken: firstString(oauth.access_token),
    refreshToken: firstString(oauth.refresh_token),
    scope: firstString(oauth.scope),
    strategy: firstString(oauth.strategy) || 'easy_mode',
    expires: normalizeEpochSeconds(firstNumber(oauth.expires)),
  };
}

function extractLegacyTokens(legacyData) {
  const tokens = asRecord(legacyData.tokens);
  return {
    accessToken: firstString(
      legacyData.accessToken,
      legacyData.access_token,
      tokens.access_token,
    ),
    refreshToken: firstString(
      legacyData.refreshToken,
      legacyData.refresh_token,
      tokens.refresh_token,
    ),
    scope: firstString(legacyData.scope),
    strategy: 'legacy_salla_tokens',
    expires: normalizeEpochSeconds(
      firstNumber(
        legacyData.expiresAt,
        legacyData.expires_at,
        tokens.expires_at,
      ),
    ),
  };
}

async function fetchSallaUserInfo(accessToken) {
  const response = await fetch('https://accounts.salla.sa/oauth2/user/info', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function refreshSallaToken(refreshToken) {
  const clientId = firstString(
    process.env.SALLA_CLIENT_ID,
    process.env.NEXT_PUBLIC_SALLA_CLIENT_ID,
  );
  const clientSecret = firstString(process.env.SALLA_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: 'missing_client_credentials',
    };
  }

  const response = await fetch('https://accounts.salla.sa/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: firstString(body.error_description, body.error) || `http_${response.status}`,
      status: response.status,
    };
  }

  const accessToken = firstString(body.access_token);
  const nextRefreshToken = firstString(body.refresh_token) || refreshToken;
  const expiresIn = firstNumber(body.expires_in);

  if (!accessToken) {
    return { ok: false, error: 'missing_access_token_in_refresh_response' };
  }

  return {
    ok: true,
    accessToken,
    refreshToken: nextRefreshToken,
    expires: expiresIn !== null ? Math.floor(Date.now() / 1000) + expiresIn : null,
  };
}

async function persistOwnerTokens(db, storeUid, ownerData, nextTokens) {
  const ownerRef = db.collection('owners').doc(storeUid);
  const current = extractOwnerTokens(ownerData);

  await ownerRef.set(
    {
      uid: storeUid,
      provider: 'salla',
      oauth: {
        access_token: nextTokens.accessToken,
        refresh_token: nextTokens.refreshToken || current.refreshToken || undefined,
        scope: nextTokens.scope || current.scope || undefined,
        expires:
          nextTokens.expires ??
          current.expires ??
          undefined,
        receivedAt: Date.now(),
        strategy: nextTokens.strategy || current.strategy || 'easy_mode',
      },
    },
    { merge: true },
  );
}

function summarizeStore(storeUid, storeData) {
  return {
    storeUid,
    storeName: getStoreName(storeUid, storeData),
    domain: getStoreDomain(storeData),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  loadEnvFiles(DEFAULTS.envFiles);
  const db = initDb();

  const storesSnap = await db.collection('stores').get();
  const sallaDocs = storesSnap.docs.filter((doc) => {
    const data = doc.data() || {};
    return !isAliasStore(doc.id, data) && firstString(data.provider).toLowerCase() === 'salla';
  });

  const report = {
    ok: true,
    mode: opts.apply ? 'apply' : 'dry_run',
    scanned: sallaDocs.length,
    stats: {
      alreadyValid: 0,
      restoredFromOwnerRefresh: 0,
      restoredFromLegacyAccess: 0,
      restoredFromLegacyRefresh: 0,
      copiedLegacyRefreshIntoOwner: 0,
      needsReauth: 0,
      missingOwner: 0,
      missingRefresh: 0,
      ownerUnauthorized: 0,
      legacyUnauthorized: 0,
      refreshFailures: 0,
      verifyFailuresAfterRefresh: 0,
    },
    restored: [],
    alreadyValid: [],
    needsReauth: [],
  };

  for (const storeDoc of sallaDocs) {
    const storeUid = storeDoc.id;
    const storeData = storeDoc.data() || {};
    const [ownerSnap, legacySnap] = await Promise.all([
      db.collection('owners').doc(storeUid).get(),
      db.collection('salla_tokens').doc(storeUid).get(),
    ]);

    const ownerData = ownerSnap.data() || {};
    const legacyData = legacySnap.data() || {};
    const ownerTokens = extractOwnerTokens(ownerData);
    const legacyTokens = extractLegacyTokens(legacyData);
    const summary = summarizeStore(storeUid, storeData);
    let lastFailure = '';

    let restored = false;

    if (ownerTokens.accessToken) {
      const ownerCheck = await fetchSallaUserInfo(ownerTokens.accessToken);
      if (ownerCheck.ok) {
        report.stats.alreadyValid += 1;
        report.alreadyValid.push({
          ...summary,
          source: 'owner_access_token',
        });

        if (!ownerTokens.refreshToken && legacyTokens.refreshToken && opts.apply) {
          await persistOwnerTokens(db, storeUid, ownerData, {
            ...ownerTokens,
            refreshToken: legacyTokens.refreshToken,
            strategy: ownerTokens.strategy || legacyTokens.strategy,
          });
          report.stats.copiedLegacyRefreshIntoOwner += 1;
        }
        continue;
      }

      if (ownerCheck.status === 401) {
        report.stats.ownerUnauthorized += 1;
      }
    } else if (!ownerSnap.exists) {
      report.stats.missingOwner += 1;
    }

    if (ownerTokens.refreshToken) {
      const refreshed = await refreshSallaToken(ownerTokens.refreshToken);
      if (refreshed.ok) {
        const verify = await fetchSallaUserInfo(refreshed.accessToken);
        if (verify.ok) {
          if (opts.apply) {
            await persistOwnerTokens(db, storeUid, ownerData, {
              ...ownerTokens,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              expires: refreshed.expires,
              strategy: ownerTokens.strategy || 'easy_mode',
            });
          }
          report.stats.restoredFromOwnerRefresh += 1;
          report.restored.push({
            ...summary,
            source: 'owner_refresh_token',
          });
          restored = true;
        } else {
          report.stats.verifyFailuresAfterRefresh += 1;
          lastFailure = `verify_after_owner_refresh_${verify.status}`;
        }
      } else {
        report.stats.refreshFailures += 1;
        lastFailure = refreshed.error || 'owner_refresh_failed';
      }
    } else if (!legacyTokens.refreshToken) {
      report.stats.missingRefresh += 1;
      lastFailure = 'missing_owner_and_legacy_refresh_token';
    }

    if (restored) {
      continue;
    }

    if (legacyTokens.accessToken) {
      const legacyCheck = await fetchSallaUserInfo(legacyTokens.accessToken);
      if (legacyCheck.ok) {
        if (opts.apply) {
          await persistOwnerTokens(db, storeUid, ownerData, {
            ...legacyTokens,
            accessToken: legacyTokens.accessToken,
            refreshToken: legacyTokens.refreshToken || ownerTokens.refreshToken,
            strategy: legacyTokens.strategy,
          });
        }
        report.stats.restoredFromLegacyAccess += 1;
        report.restored.push({
          ...summary,
          source: 'legacy_access_token',
        });
        continue;
      }

      if (legacyCheck.status === 401) {
        report.stats.legacyUnauthorized += 1;
        lastFailure = 'legacy_access_token_unauthorized';
      }
    }

    if (legacyTokens.refreshToken) {
      const refreshed = await refreshSallaToken(legacyTokens.refreshToken);
      if (refreshed.ok) {
        const verify = await fetchSallaUserInfo(refreshed.accessToken);
        if (verify.ok) {
          if (opts.apply) {
            await persistOwnerTokens(db, storeUid, ownerData, {
              ...legacyTokens,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              expires: refreshed.expires,
              strategy: legacyTokens.strategy,
            });
          }
          report.stats.restoredFromLegacyRefresh += 1;
          report.restored.push({
            ...summary,
            source: 'legacy_refresh_token',
          });
          continue;
        }
        report.stats.verifyFailuresAfterRefresh += 1;
        lastFailure = `verify_after_legacy_refresh_${verify.status}`;
      } else {
        report.stats.refreshFailures += 1;
        lastFailure = refreshed.error || 'legacy_refresh_failed';
      }
    }

    report.stats.needsReauth += 1;
    report.needsReauth.push({
      ...summary,
      reason: lastFailure || 'merchant_reauthorization_required',
      ownerHasRefreshToken: Boolean(ownerTokens.refreshToken),
      legacyHasRefreshToken: Boolean(legacyTokens.refreshToken),
      reconnectUrl:
        process.env.NEXT_PUBLIC_SALLA_APP_URL ||
        'https://apps.salla.sa/ar/app/1180703836',
    });
  }

  const outPath = path.resolve(process.cwd(), opts.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: report.mode,
        scanned: report.scanned,
        stats: report.stats,
        outPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});

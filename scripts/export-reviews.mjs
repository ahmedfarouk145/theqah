// scripts/export-reviews.mjs
// Production-safe Firestore reviews exporter (paginated + streaming)

import fs from "fs";
import path from "path";
import process from "process";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const DEFAULTS = {
  collection: "reviews",
  format: "json",
  pageSize: 500,
  envFiles: [".env.local", ".env.production.local", ".env"],
};

const CSV_HEADERS = [
  "id",
  "storeUid",
  "orderId",
  "productId",
  "rating",
  "status",
  "verified",
  "published",
  "source",
  "sallaReviewId",
  "needsSallaId",
  "createdAt",
  "publishedAt",
  "updatedAt",
  "data_json",
];

function printHelp() {
  console.log(`
Usage:
  node scripts/export-reviews.mjs [options]

Options:
  --out <file>           Output file path (default: reviews-export-<timestamp>.<ext>)
  --format <json|jsonl|csv>  Output format (default: ${DEFAULTS.format})
  --page-size <number>   Firestore page size (default: ${DEFAULTS.pageSize})
  --limit <number>       Max documents to export
  --collection <name>    Firestore collection (default: ${DEFAULTS.collection})
  --env-file <file>      Load env vars from a specific file (repeatable)
  --no-env-load          Do not load env files automatically
  --project-id <id>      Override Firebase project ID
  --pretty               Pretty-print JSON output (only with --format json)
  --help                 Show this help

Auth via service account env vars:
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY

Alternative auth:
  GOOGLE_APPLICATION_CREDENTIALS (Application Default Credentials)

CSV notes:
  CSV output uses fixed columns + a data_json column containing the full serialized document.
`);
}

function parseArgs(argv) {
  const opts = {
    out: "",
    format: DEFAULTS.format,
    pageSize: DEFAULTS.pageSize,
    limit: undefined,
    collection: DEFAULTS.collection,
    envFiles: [],
    noEnvLoad: false,
    projectId: "",
    pretty: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      opts.help = true;
      continue;
    }
    if (arg === "--no-env-load") {
      opts.noEnvLoad = true;
      continue;
    }
    if (arg === "--pretty") {
      opts.pretty = true;
      continue;
    }

    const readValue = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return next;
    };

    if (arg === "--out") {
      opts.out = readValue();
      continue;
    }
    if (arg === "--format") {
      opts.format = readValue().toLowerCase();
      continue;
    }
    if (arg === "--page-size") {
      opts.pageSize = Number(readValue());
      continue;
    }
    if (arg === "--limit") {
      opts.limit = Number(readValue());
      continue;
    }
    if (arg === "--collection") {
      opts.collection = readValue();
      continue;
    }
    if (arg === "--env-file") {
      opts.envFiles.push(readValue());
      continue;
    }
    if (arg === "--project-id") {
      opts.projectId = readValue();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["json", "jsonl", "csv"].includes(opts.format)) {
    throw new Error(`Invalid format "${opts.format}". Use json, jsonl, or csv.`);
  }
  if (!Number.isInteger(opts.pageSize) || opts.pageSize <= 0) {
    throw new Error("--page-size must be a positive integer");
  }
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  return opts;
}

function loadEnvFiles(files) {
  for (const file of files) {
    const resolved = path.resolve(process.cwd(), file);
    if (!fs.existsSync(resolved)) continue;

    const content = fs.readFileSync(resolved, "utf8");
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
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
      "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
      authMode: "service_account_env",
    };
  }

  return {
    projectId: projectId || undefined,
    credential: applicationDefault(),
    authMode: "application_default_credentials",
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
    resolvedProjectId: app.options.projectId || init.projectId || "unknown",
  };
}

function toSerializable(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (typeof value.toDate === "function" && typeof value.toMillis === "function") {
      return value.toDate().toISOString();
    }

    if (typeof value.path === "string" && typeof value.firestore === "object") {
      return { __type: "DocumentReference", path: value.path };
    }

    if (typeof value.latitude === "number" && typeof value.longitude === "number") {
      return { __type: "GeoPoint", latitude: value.latitude, longitude: value.longitude };
    }

    if (typeof value.toBase64 === "function") {
      return { __type: "Bytes", base64: value.toBase64() };
    }

    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = toSerializable(nested);
    }
    return result;
  }

  return value;
}

function createOutputStream(opts) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = opts.format === "jsonl" ? "jsonl" : opts.format === "csv" ? "csv" : "json";
  const outputPath = path.resolve(process.cwd(), opts.out || `${opts.collection}-export-${timestamp}.${ext}`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const stream = fs.createWriteStream(outputPath, { encoding: "utf8" });

  return { outputPath, stream };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return csvEscape(value);
  }
  return csvEscape(JSON.stringify(value));
}

function buildCsvRow(record) {
  return [
    toCsvCell(record.id),
    toCsvCell(record.storeUid),
    toCsvCell(record.orderId),
    toCsvCell(record.productId),
    toCsvCell(record.rating),
    toCsvCell(record.status),
    toCsvCell(record.verified),
    toCsvCell(record.published),
    toCsvCell(record.source),
    toCsvCell(record.sallaReviewId),
    toCsvCell(record.needsSallaId),
    toCsvCell(record.createdAt),
    toCsvCell(record.publishedAt),
    toCsvCell(record.updatedAt),
    toCsvCell(record.data_json),
  ].join(",");
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function exportCollection(opts) {
  if (!opts.noEnvLoad) {
    loadEnvFiles(opts.envFiles.length ? opts.envFiles : DEFAULTS.envFiles);
  }

  const { db, authMode, resolvedProjectId } = initDb(opts.projectId);
  const { outputPath, stream } = createOutputStream(opts);

  let exported = 0;
  let page = 0;
  let firstItem = true;
  let lastDoc = null;

  console.log(`[export-reviews] project=${resolvedProjectId} auth=${authMode}`);
  console.log(`[export-reviews] collection=${opts.collection} format=${opts.format} pageSize=${opts.pageSize}`);
  if (opts.limit) {
    console.log(`[export-reviews] limit=${opts.limit}`);
  }
  console.log(`[export-reviews] output=${outputPath}`);

  if (opts.format === "json") {
    await writeChunk(stream, "[\n");
  } else if (opts.format === "csv") {
    await writeChunk(stream, `${CSV_HEADERS.join(",")}\n`);
  }

  try {
    while (true) {
      let query = db.collection(opts.collection).orderBy(FieldPath.documentId()).limit(opts.pageSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      page += 1;

      for (const doc of snapshot.docs) {
        if (opts.limit !== undefined && exported >= opts.limit) break;

        const serializedData = toSerializable(doc.data());
        const record = { id: doc.id, ...serializedData };
        const payload = JSON.stringify(record, null, opts.pretty && opts.format === "json" ? 2 : 0);

        if (opts.format === "jsonl") {
          await writeChunk(stream, `${payload}\n`);
        } else if (opts.format === "csv") {
          const csvRecord = {
            id: doc.id,
            storeUid: serializedData?.storeUid,
            orderId: serializedData?.orderId,
            productId: serializedData?.productId,
            rating: serializedData?.rating,
            status: serializedData?.status,
            verified: serializedData?.verified,
            published: serializedData?.published,
            source: serializedData?.source,
            sallaReviewId: serializedData?.sallaReviewId,
            needsSallaId: serializedData?.needsSallaId,
            createdAt: serializedData?.createdAt,
            publishedAt: serializedData?.publishedAt,
            updatedAt: serializedData?.updatedAt,
            data_json: payload,
          };
          await writeChunk(stream, `${buildCsvRow(csvRecord)}\n`);
        } else {
          if (!firstItem) {
            await writeChunk(stream, ",\n");
          }
          await writeChunk(stream, payload);
          firstItem = false;
        }

        exported += 1;
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1] || lastDoc;
      console.log(`[export-reviews] page=${page} exported=${exported}`);

      if (opts.limit !== undefined && exported >= opts.limit) break;
      if (snapshot.size < opts.pageSize) break;
    }

    if (opts.format === "json") {
      if (!firstItem) {
        await writeChunk(stream, "\n");
      }
      await writeChunk(stream, "]\n");
    }

    await closeStream(stream);
    console.log(`[export-reviews] done: ${exported} docs`);
  } catch (error) {
    try {
      await closeStream(stream);
    } catch {
      // ignore cleanup errors after primary failure
    }
    throw error;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  await exportCollection(opts);
}

main().catch((error) => {
  console.error("[export-reviews] failed:", error?.message || error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Dump all project files into a single TXT with separators (ESM version)
 * Usage:
 *   node tools/dump-project.mjs
 *   node tools/dump-project.mjs --dir . --out project-dump.txt
 *   node tools/dump-project.mjs --include-env --include-binaries
 *   node tools/dump-project.mjs --max-bytes 2097152
 */

import fs from 'fs';
import * as fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ----- resolve __dirname in ESM -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- CLI args ----------------
const args = process.argv.slice(2);
function getFlag(name) {
  const ix = args.indexOf(`--${name}`);
  if (ix === -1) return undefined;
  const next = args[ix + 1];
  return next && !next.startsWith('--') ? next : true;
}
const rootDir = path.resolve(getFlag('dir') || process.cwd());
const outFile = path.resolve(getFlag('out') || path.join(process.cwd(), 'project-dump.txt'));
const includeBinaries = Boolean(getFlag('include-binaries'));
const includeEnv = Boolean(getFlag('include-env'));
const maxBytes = Number(getFlag('max-bytes') || 1_048_576); // 1MB default

// ------------- Ignore rules ---------------
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.vercel',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'out',
  'coverage',
  '.idea',
  '.vscode',
  '.parcel-cache',
  '.pnpm-store',
  '.expo',
  'tmp',
  'temp',
]);

const BINARY_EXTS = new Set([
  // archives
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  // images
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.bmp', '.tiff', '.psd', '.ai', '.svg',
  // fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // audio/video
  '.mp3', '.wav', '.ogg', '.mp4', '.m4a', '.mov', '.avi', '.mkv', '.webm',
  // docs/binaries
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm',
]);

const ALWAYS_SKIP_FILES = new Set([
  // ممكن تسيبها فاضية أو تضيف لاكس لو عايز
  // 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
]);

function isEnvFile(base) {
  return base === '.env' || base.startsWith('.env.');
}

function isBinaryByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTS.has(ext);
}

function isInsideIgnoredDir(absPath) {
  const rel = path.relative(rootDir, absPath);
  if (!rel || rel.startsWith('..')) return false;
  const parts = rel.split(path.sep);
  return parts.some(p => IGNORED_DIRS.has(p));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB','MB','GB','TB'];
  let u = -1, size = n;
  do { size /= 1024; u++; } while (size >= 1024 && u < units.length - 1);
  return `${size.toFixed(1)} ${units[u]}`;
}

// async generator to walk the tree
async function* walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of entries) {
    const abs = path.join(dir, d.name);
    if (isInsideIgnoredDir(abs)) continue;
    if (d.isDirectory()) {
      yield* walk(abs);
    } else if (d.isFile()) {
      yield abs;
    }
  }
}

async function gatherFiles() {
  const files = [];
  for await (const abs of walk(rootDir)) {
    // skip output file itself
    if (path.resolve(abs) === outFile) continue;

    const base = path.basename(abs);
    if (ALWAYS_SKIP_FILES.has(base)) continue;

    if (!includeEnv && isEnvFile(base)) continue;

    files.push(abs);
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function makeSeparator(title) {
  const line = `====[ ${title} ]`;
  const pad = Math.max(4, 100 - line.length);
  return `${line}${'='.repeat(pad)}\n`;
}

(async function main() {
  await fsp.mkdir(path.dirname(outFile), { recursive: true });

  const out = fs.createWriteStream(outFile, { encoding: 'utf8' });

  const started = new Date();
  out.write(makeSeparator('PROJECT DUMP - METADATA'));
  out.write(`Root   : ${rootDir}\n`);
  out.write(`Output : ${outFile}\n`);
  out.write(`When   : ${started.toISOString()}\n`);
  out.write(`Rules  : skip binaries=${!includeBinaries}, skip .env*=${!includeEnv}, maxBytes=${formatBytes(maxBytes)}\n\n`);

  const files = await gatherFiles();

  out.write(makeSeparator('FILE LIST'));
  for (const f of files) {
    try {
      const st = await fsp.stat(f);
      out.write(`${path.relative(rootDir, f).split(path.sep).join('/')}\t(${formatBytes(st.size)})\n`);
    } catch {
      // ignore stat errors
    }
  }
  out.write('\n');

  out.write(makeSeparator('FILE CONTENTS'));

  let included = 0, skipped = 0;

  for (const abs of files) {
    const rel = path.relative(rootDir, abs).split(path.sep).join('/');
    let st;
    try {
      st = await fsp.stat(abs);
    } catch (err) {
      out.write(makeSeparator(`SKIP (stat error): ${rel}`));
      out.write(String(err?.message || err) + '\n\n');
      skipped++;
      continue;
    }

    const isBin = isBinaryByExt(abs);
    if (isBin && !includeBinaries) {
      out.write(makeSeparator(`SKIP (binary): ${rel}`));
      out.write(`Size: ${formatBytes(st.size)}\n\n`);
      skipped++;
      continue;
    }

    if (st.size > maxBytes) {
      out.write(makeSeparator(`SKIP (too large): ${rel}`));
      out.write(`Size: ${formatBytes(st.size)} > limit ${formatBytes(maxBytes)}\n\n`);
      skipped++;
      continue;
    }

    out.write(makeSeparator(`START FILE: ${rel} (${formatBytes(st.size)})`));
    try {
      const buf = await fsp.readFile(abs);
      const content = isBin && includeBinaries ? buf.toString('base64') : buf.toString('utf8');
      if (isBin && includeBinaries) {
        out.write(`[BINARY FILE DUMPED AS BASE64]\n`);
      }
      out.write(content);
      if (!content.endsWith('\n')) out.write('\n');
      included++;
    } catch (err) {
      out.write(`[[ ERROR READING FILE: ${String(err?.message || err)} ]]\n`);
      skipped++;
    }
    out.write(makeSeparator(`END FILE: ${rel}`));
    out.write('\n');
  }

  out.write(makeSeparator('SUMMARY'));
  out.write(`Total files seen : ${files.length}\n`);
  out.write(`Included         : ${included}\n`);
  out.write(`Skipped          : ${skipped}\n`);
  out.write(`Finished at      : ${new Date().toISOString()}\n`);
  out.end();

  out.on('finish', () => {
    console.log(`✅ Dump complete: ${outFile}`);
  });
})();

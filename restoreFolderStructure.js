// File: restoreFolderStructure.js
/* eslint-env node */
"use strict";

const fs   = require("fs");
const path = require("path");

/* ──────────────────────────────────────────────────────────────── */
/*   Perf counters                                                 */
/* ──────────────────────────────────────────────────────────────── */
let restoredCount = 0;
let startHR;

/* ──────────────────────────────────────────────────────────────── */
/*   ChatGPT-artefact cleanup                                       */
/* ──────────────────────────────────────────────────────────────── */
function removeArtifacts(str) {
  return str
    .replace(/^\uFEFF/, "")                 // BOM
    .replace(/[\u200B-\u200D\u2060]+/g, "") // zero-width chars
    .replace(/[“”]/g, '"')                  // curly quotes
    .replace(/[‘’]/g, "'");
}

/* ──────────────────────────────────────────────────────────────── */
/*   Detect “File:” headers (all common comment styles)            */
/* ──────────────────────────────────────────────────────────────── */
const HEADER_REGEXES = [
  /^\s*\/\/\s*File:\s*(.*?)\s*$/,             // // File: …
  /^\s*\/\*\s*File:\s*(.*?)\s*\*\/\s*$/,      // /* File: … */
  /^\s*#\s*File:\s*(.*?)\s*$/,                // # File: …
  /^\s*<!--\s*File:\s*(.*?)\s*-->\s*$/,       // <!-- File: … -->
  /^\s*--\s*File:\s*(.*?)\s*$/                // -- File: …
];

function parseFileHeader(rawLine) {
  const line = removeArtifacts(rawLine.trimEnd());
  for (const re of HEADER_REGEXES) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────── */
/*   Path helpers                                                  */
/* ──────────────────────────────────────────────────────────────── */
function sanitizePath(p) {
  /* kill leading slashes / drive letters → avoid writing at FS root */
  return p.replace(/^([A-Za-z]:)?[\\/]+/, "");
}

/* write a single file under restoreRoot */
function writeFile(restoreRoot, relPath, lines) {
  const sanitized = sanitizePath(relPath);
  if (!sanitized) return;

  const dest = path.join(restoreRoot, sanitized);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  /* Drop the header for pure-JSON files */
  if (path.extname(sanitized).toLowerCase() === ".json") {
    lines.shift();
  }

  fs.writeFileSync(dest, lines.join("\n"), "utf8");
  restoredCount++;
}

/* ──────────────────────────────────────────────────────────────── */
/*   Core routine                                                  */
/* ──────────────────────────────────────────────────────────────── */
function restoreStructure(aggregatedTxt) {
  startHR = process.hrtime.bigint();

  const inputAbs   = path.resolve(process.cwd(), aggregatedTxt);
  const restoreDir = path.join(path.dirname(inputAbs), "restored-data");
  fs.mkdirSync(restoreDir, { recursive: true });

  const lines = fs.readFileSync(inputAbs, "utf8").split(/\r?\n/);

  let inFence              = false; // ````fence```
  let currentHeader        = null;
  let currentFileContents  = [];

  const flush = () => {
    if (currentHeader) {
      writeFile(restoreDir, currentHeader, currentFileContents);
    }
    currentHeader       = null;
    currentFileContents = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    /* toggle & skip triple-back-tick fences */
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;                       // ignore outside-snippet cruft

    const maybeHeader = parseFileHeader(rawLine);

    if (maybeHeader !== null) {
      flush();                                   // finish previous
      currentHeader        = maybeHeader;
      currentFileContents  = [rawLine];          // keep the comment line
    } else if (currentHeader) {
      currentFileContents.push(rawLine);
    }
  }
  flush();                                       // final file

  const seconds = Number(process.hrtime.bigint() - startHR) / 1e9;
  console.log(`Restored ${restoredCount} files in ${seconds.toFixed(4)} s → ${restoreDir}`);
}

/* ──────────────────────────────────────────────────────────────── */
/*   CLI                                                            */
/* ──────────────────────────────────────────────────────────────── */
if (process.argv.length < 2 + 1) {
  console.error("Usage: node restoreFolderStructure.js <aggregated.txt>");
  process.exit(1);
}

restoreStructure(process.argv[2]);

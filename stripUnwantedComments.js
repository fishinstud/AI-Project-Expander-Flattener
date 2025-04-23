// File: stripUnwantedComments.js
/* eslint-env node */
"use strict";

/**
 * stripUnwantedComments.js ─ cleans text-dumps before minification.
 *
 *   node stripUnwantedComments.js input.txt output.txt
 */

const fs   = require("fs");
const path = require("path");

/* ─────────────────────────  ChatGPT artefacts  ───────────────────────── */
function cleanArtifacts(txt) {
  return txt
    .replace(/^\uFEFF/, "")                      // BOM
    .replace(/[\u200B-\u200D\u2060]+/g, "")      // zero-width
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'"); // curly quotes
}

function stripCodeFence(txt) {
  const t = txt.trim();
  if (!t.startsWith("```")) return txt;
  const lines = t.split(/\r?\n/);
  lines.shift();
  if (lines.length && /^```/.test(lines.at(-1).trim())) lines.pop();
  return lines.join("\n");
}

/* ─────────────────────────────  Regexes  ─────────────────────────────── */
const recognisedSeparators = [
  /^\s*\/\/\s*File:\s*\S+/,
  /^\s*\/\*\s*File:\s*\S+.*\*\/\s*$/,
  /^\s*--\s*File:\s*\S+/,
  /^\s*#\s*File:\s*\S+/,
  /^\s*<!--\s*File:\s*\S+.*-->\s*$/
];

const oneLineBlockCmt = /^\s*(?:\/\*.*\*\/|<!--.*-->)/;

/* any comment prefix on a **single** line                                 */
function isCommentLine(l) {
  const t = l.trimStart();
  return (
    t.startsWith("//")   ||
    t.startsWith("/*")   ||
    t.startsWith("--")   ||
    t.startsWith("#")    ||
    t.startsWith("<!--") ||
    t.startsWith("*")    ||   // inside block banners
    t.startsWith("*/")
  );
}

function isRecognisedSeparator(l) {
  return recognisedSeparators.some((re) => re.test(l));
}

/* ──────────────────────────────  Core  ──────────────────────────────── */
function stripUnwantedComments(inputFile, outputFile) {
  let src = fs.readFileSync(inputFile, "utf8");
  src     = stripCodeFence(cleanArtifacts(src)).replace(/\r\n/g, "\n");

  const out      = [];
  let   blanks   = 0;
  let   inBlock  = false;          // inside unwanted /* … */ or <!-- … -->

  for (const raw of src.split("\n")) {
    const line = raw;             // keep original for separator test
    const trim = line.trim();

    /* ── exit block? ─────────────────────────────────────────────── */
    if (inBlock) {
      if (/.*\*\/\s*$/.test(trim) || /.*-->\s*$/.test(trim)) inBlock = false;
      continue; // skip everything inside
    }

    /* ── recognised “File:” separator → keep verbatim ───────────── */
    if (isRecognisedSeparator(trim)) {
      out.push(trim);
      blanks = 0;
      continue;
    }

    /* ── multi-line comment open? ───────────────────────────────── */
    if ((trim.startsWith("/*")  && !isRecognisedSeparator(trim)) ||
        (trim.startsWith("<!--") && !isRecognisedSeparator(trim))) {
      if (!/.*\*\/\s*$/.test(trim) && !/.*-->\s*$/.test(trim)) {
        inBlock = true;           // enter long block
      }
      continue;                   // skip opener line
    }

    /* ── one-liner block comments ───────────────────────────────── */
    if (oneLineBlockCmt.test(trim) && !isRecognisedSeparator(trim)) continue;

    /* ── single-line comments we don’t want ─────────────────────── */
    if (isCommentLine(trim) && !isRecognisedSeparator(trim)) continue;

    /* ── blank-line collapse ────────────────────────────────────── */
    if (trim === "") {
      if (++blanks > 1) continue;
    } else {
      blanks = 0;
    }

    out.push(trim);
  }

  const result = out.join("\n") + "\n";
  fs.writeFileSync(outputFile, result, "utf8");
  console.log(`Done! Wrote cleaned content to ${outputFile}`);
}

/* ──────────────────────────────  CLI  ──────────────────────────────── */
if (process.argv.length < 4) {
  console.error("Usage: node stripUnwantedComments.js <inputFile> <outputFile>");
  process.exit(1);
}

const [inFile, outFile] = process.argv.slice(2).map((p) => path.resolve(process.cwd(), p));
stripUnwantedComments(inFile, outFile);

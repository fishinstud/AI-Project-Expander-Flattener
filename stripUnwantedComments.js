// File: stripUnwantedComments.js
/* eslint-env node */
"use strict";

const fs   = require("fs");
const path = require("path");

/* ─────────────────────────────────────────────────────────────── */
/*   Utility: Clean up ChatGPT artefacts                           */
/* ─────────────────────────────────────────────────────────────── */
function cleanArtifacts(text) {
  return text
    // Strip BOM
    .replace(/^\uFEFF/, "")
    // Remove zero-width chars
    .replace(/[\u200B-\u200D\u2060]+/g, "")
    // Replace curly quotes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/** Remove wrapping ``` fences (if the *whole* file is fenced) */
function stripCodeFence(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return text;

  const lines = trimmed.split(/\r?\n/);
  // drop the opening line (``` or ```lang)
  lines.shift();
  // drop the last ```` line if present
  if (lines.length && /^```/.test(lines[lines.length - 1].trim())) lines.pop();
  return lines.join("\n");
}

/* ─────────────────────────────────────────────────────────────── */
/*   Regexes                                                       */
/* ─────────────────────────────────────────────────────────────── */
const recognizedSeparators = [
  /^\s*\/\/\s*File:\s*\S+/,             // // File:
  /^\s*\/\*\s*File:\s*\S+.*\*\/\s*$/,   // /* File: … */
  /^\s*--\s*File:\s*\S+/,               // -- File:
  /^\s*#\s*File:\s*\S+/,                // # File:
  /^\s*<!--\s*File:\s*\S+.*-->\s*$/     // <!-- File: … -->
];

function isRecognizedSeparator(line) {
  return recognizedSeparators.some((re) => re.test(line));
}

/** Detect *any* comment prefix we care about                       */
function isCommentLine(line) {
  const t = line.trimStart();
  return (
    t.startsWith("//")  ||
    t.startsWith("/*")  ||
    t.startsWith("--")  ||
    t.startsWith("#")   ||
    t.startsWith("<!--")
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*   Core                                                          */
/* ─────────────────────────────────────────────────────────────── */
function stripUnwantedComments(inputFile, outputFile) {
  let content = fs.readFileSync(inputFile, "utf8");
  content     = stripCodeFence(cleanArtifacts(content))
                // normalise CRLF → LF
                .replace(/\r\n/g, "\n");

  const lines        = content.split("\n");
  const resultLines  = [];
  let   blankStreak  = 0;

  for (let ln of lines) {
    // ignore comment lines that are *not* recognised separators
    if (isCommentLine(ln) && !isRecognizedSeparator(ln)) continue;

    const trimmed = ln.trim();

    if (trimmed === "") {
      blankStreak++;
      if (blankStreak > 1) continue;   // skip extra blanks
    } else {
      blankStreak = 0;
    }
    resultLines.push(trimmed);
  }

  // Ensure file ends with a single newline
  const output = resultLines.join("\n") + "\n";
  fs.writeFileSync(outputFile, output, "utf8");
  console.log(`Done! Wrote cleaned content to ${outputFile}`);
}

/* ─────────────────────────────────────────────────────────────── */
/*   CLI                                                           */
/* ─────────────────────────────────────────────────────────────── */
if (process.argv.length < 4) {
  console.error("Usage: node stripUnwantedComments.js <inputFile> <outputFile>");
  process.exit(1);
}

const [inputFile, outputFile] = process.argv.slice(2).map((p) => path.resolve(process.cwd(), p));
stripUnwantedComments(inputFile, outputFile);

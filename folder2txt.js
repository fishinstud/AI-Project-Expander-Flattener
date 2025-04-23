// File: folder2txt.js
/* eslint-env node */
"use strict";

const fs   = require("fs");
const path = require("path");

const MAX_FILES = 1000;

/* ------------------------------------------------------------------ */
/*  Load configs – fall back gracefully if they live next to this file */
/* ------------------------------------------------------------------ */
const CWD            = process.cwd();
const SCRIPT_DIR     = path.dirname(__filename);
const requireFromCwd = (p) => require(path.isAbsolute(p) ? p : path.join(CWD, p));

const i18n         = requireFromCwd("./i18n.json");
const ignoreConfig = requireFromCwd("./ignore.json");

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** shell-style wildcard test ( * only )                                          */
function matchWildcard(str, pattern) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex  = new RegExp(`^${pattern.split("*").map(escape).join(".*")}$`);
  return regex.test(str);
}

/** should this path be ignored?                                         */
function shouldIgnore(filePath, isFolder = false) {
  const name             = path.basename(filePath);
  const { folders, files } = ignoreConfig;

  return isFolder
    ? folders.some((pat) => name === pat || matchWildcard(name, pat))
    : files  .some((pat) => name === pat || matchWildcard(name, pat));
}

/** count files recursively, abort early after MAX_FILES                  */
function countFiles(folderPath) {
  let count = 0;
  for (const entry of fs.readdirSync(folderPath)) {
    const fp   = path.join(folderPath, entry);
    const stat = fs.statSync(fp);

    if (stat.isFile() && !shouldIgnore(fp)) {
      count++;
    } else if (stat.isDirectory() && !shouldIgnore(fp, true)) {
      count += countFiles(fp);
    }
    if (count > MAX_FILES) return Infinity;
  }
  return count;
}

/* ----------------------------- HEADER UTILS ----------------------------- */

/** language-appropriate comment for “File: …”                             */
function getCommentHeader(rel) {
  const ext = path.extname(rel).toLowerCase();
  const m   = {
    slashes : [".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".h"],
    blocks  : [".css", ".scss", ".sass", ".less"],
    hash    : [".py", ".sh", ".rb", ".ps1"],
    html    : [".html", ".htm", ".vue", ".svelte"],
    sql     : [".sql"],
    lua     : [".lua"]
  };

  if (m.slashes.includes(ext)) return `// File: ${rel}\n`;
  if (m.blocks .includes(ext)) return `/* File: ${rel} */\n`;
  if (m.hash   .includes(ext)) return `# File: ${rel}\n`;
  if (m.html   .includes(ext)) return `<!-- File: ${rel} -->\n`;
  if (m.sql    .includes(ext)) return `-- File: ${rel}\n`;
  if (m.lua    .includes(ext)) return `-- File: ${rel}\n`;

  // default
  return `// File: ${rel}\n`;
}

/** does the *first* non-blank line already contain a recognisable header? */
function alreadyHasHeader(content) {
  const first = content.split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const cleaned = removeChatGPTArtifacts(first).trimStart();
  return /^(?:\/\/|\/\*|#|<!--|--)\s*File:/i.test(cleaned);
}

/** quick check for the JS-style header specifically                       */
function alreadyHasJsHeader(content) {
  const first = content.split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const cleaned = removeChatGPTArtifacts(first).trimStart();
  return cleaned.startsWith("// File:");
}

/* --------------------------- SANITISATION --------------------------- */

/** strip BOM, zero-width spaces, curly quotes, ``` fences,                *
 *  and normalise line endings to LF                                       */
function removeChatGPTArtifacts(src) {
  let s = src
    // BOM & zero-width chars
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]+/g, "")

    // fancy quotes → normal quotes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  return s;
}

/** unwrap ``` fences if the whole file was pasted verbatim                */
function stripCodeFences(src) {
  const trimmed = src.trim();
  if (!trimmed.startsWith("```")) return src;          // nothing to do

  const lines = trimmed.split(/\r?\n/);
  // first line is ``` or ```lang
  lines.shift();
  // last line is ```
  if (lines[lines.length - 1].startsWith("```")) lines.pop();

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Core                                                               */
/* ------------------------------------------------------------------ */
function processFolder({ folderPath, outputPath, lang = "en" }) {
  const total = countFiles(folderPath);

  if (total > MAX_FILES) {
    console.log(`(${total}) ${i18n[lang]["The number of files exceeds the limit of"]} ${MAX_FILES}`);
    return;
  }

  // ensure parent dir exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`${i18n[lang]["Starting writing output file"]} ${outputPath}`);
  const out = fs.createWriteStream(outputPath, { encoding: "utf8" });

  const writeFile = (absPath) => {
    console.log(`${i18n[lang]["Writing file"]} ${absPath}`);

    const rel   = path.relative(CWD, absPath);
    const raw   = fs.readFileSync(absPath, "utf8");
    const clean = stripCodeFences(removeChatGPTArtifacts(raw));

    const ext = path.extname(absPath).toLowerCase();

    if (ext === ".js") {
      if (!alreadyHasJsHeader(clean)) out.write(getCommentHeader(rel));
      out.write(clean.replace(/\r\n/g, "\n"));
    } else {
      if (!alreadyHasHeader(clean))   out.write(getCommentHeader(rel));
      out.write(clean.replace(/\r\n/g, "\n"));
    }

    out.write("\n\n"); // spacer between files
  };

  (function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const abs = path.join(dir, entry);
      const st  = fs.statSync(abs);

      if (st.isFile() && !shouldIgnore(abs))          writeFile(abs);
      else if (st.isDirectory() && !shouldIgnore(abs, true)) walk(abs);
    }
  })(folderPath);

  out.end();
  console.log(`${i18n[lang]["Finished writing output file"]} ${outputPath}`);
}

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */
const args = process.argv.slice(2)
  .reduce((acc, cur) => {
    const [k, v] = cur.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

if (!args.folder || !args.output) {
  console.error(i18n.en.Usage);
  process.exit(1);
}

processFolder({
  folderPath : path.resolve(CWD, args.folder),
  outputPath : path.resolve(CWD, args.output),
  lang       : args.lang || "en"
});

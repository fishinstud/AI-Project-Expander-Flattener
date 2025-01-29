const fs = require('fs');
const path = require('path');

let restoredFileCount = 0;
let startTime;
let endTime;


function parseFileHeader(line) {
  const trimmedLine = line.trimEnd();

  // Regex for block-style:  /* File: <path> */
  const blockCommentRegex = /^\s*\/\*\s*File:\s*(.*?)\s*\*\/\s*$/;
  // Regex for line-style:   // File: <path>
  const lineCommentRegex  = /^\s*\/\/\s*File:\s*(.*?)\s*$/;
  // Regex for dash-style:   -- File: <path>
  const dashCommentRegex  = /^\s*--\s*File:\s*(.*?)\s*$/;

  let match = trimmedLine.match(blockCommentRegex);
  if (match) {
    return match[1].trim();
  }
  match = trimmedLine.match(lineCommentRegex);
  if (match) {
    return match[1].trim();
  }
  match = trimmedLine.match(dashCommentRegex);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * sanitizePath:
 *   Removes leading slashes or drive letters so we don't attempt to create
 *   directories at the root. e.g. "/home/APEF/client/package.json" => "home/APEF/client/package.json"
 */
function sanitizePath(filePath) {
  return filePath.replace(/^([A-Za-z]:)?[\\/]+/, '');
}

/**
 * processOutputFile:
 *   Reads lines from the aggregated text file, uses parseFileHeader to detect boundaries,
 *   writes each file under "restored-data".  If it's a .json file, we remove the first line
 *   (the header) for pure JSON.  Also prints how many files were restored and total time.
 */
function processOutputFile(inputFilePath) {
  startTime = process.hrtime.bigint();

  const inputAbsolutePath = path.resolve(process.cwd(), inputFilePath);
  const baseDir = path.dirname(inputAbsolutePath);
  const restoreRoot = path.join(baseDir, 'restored-data');

  fs.mkdirSync(restoreRoot, { recursive: true });

  const lines = fs.readFileSync(inputAbsolutePath, 'utf-8').split(/\r?\n/);

  let currentFileHeaderPath = null;
  let currentFileLines = [];

  function writeCurrentFile() {
    if (currentFileHeaderPath && currentFileLines.length > 0) {
      const sanitized = sanitizePath(currentFileHeaderPath);
      if (!sanitized) return;

      const fullFilePath = path.join(restoreRoot, sanitized);
      const dirPath = path.dirname(fullFilePath);

      fs.mkdirSync(dirPath, { recursive: true });

      // If it's a .json file, remove the first line (the header comment).
      if (path.extname(sanitized).toLowerCase() === '.json') {
        currentFileLines.shift();
      }

      fs.writeFileSync(fullFilePath, currentFileLines.join('\n'), 'utf-8');
      restoredFileCount++;
    }
  }

  for (const line of lines) {
    const maybePath = parseFileHeader(line);

    if (maybePath !== null) {
      // Found a new file => finalize the previous file
      writeCurrentFile();

      currentFileHeaderPath = maybePath;
      currentFileLines = [line]; // keep the comment line
    } else {
      if (currentFileHeaderPath) {
        currentFileLines.push(line);
      }
    }
  }

  // Final file
  writeCurrentFile();

  endTime = process.hrtime.bigint();
  const elapsedSeconds = Number(endTime - startTime) / 1e9;
  console.log(`Restored ${restoredFileCount} files in ${elapsedSeconds.toFixed(4)} seconds.`);
}

// CLI usage
if (process.argv.length < 3) {
  console.log("Usage: node restoreFolderStructure.js <output file path>");
  process.exit(1);
}

const inputFilePath = process.argv[2];
processOutputFile(inputFilePath);

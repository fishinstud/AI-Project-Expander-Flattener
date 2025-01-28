const fs = require('fs');
const path = require('path');

function parseFileHeader(line) {
  const trimmedLine = line.trimEnd();

  // Regex for block-style:  /* File: <path> */
  const blockCommentRegex = /^\s*\/\*\s*File:\s*(.*?)\s*\*\/\s*$/;
  // Regex for line-style:   // File: <path>
  const lineCommentRegex  = /^\s*\/\/\s*File:\s*(.*?)\s*$/;

  let match = trimmedLine.match(blockCommentRegex);
  if (match) {
    return match[1].trim();
  }
  match = trimmedLine.match(lineCommentRegex);
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

let restoredFileCount = 0; // Count how many files get restored
let startTime;
let endTime;

/**
 * processOutputFile:
 *   Reads lines from the text file, uses parseFileHeader to detect boundaries,
 *   writes each file under "restored-data".  If it's a .json file, we strip
 *   the header comment from the restored file so the JSON is valid.
 */
function processOutputFile(inputFilePath) {
  startTime = process.hrtime.bigint();

  // Setup paths
  const inputAbsolutePath = path.resolve(process.cwd(), inputFilePath);
  const baseDir = path.dirname(inputAbsolutePath);
  const restoreRoot = path.join(baseDir, 'restored-data');

  fs.mkdirSync(restoreRoot, { recursive: true });

  const lines = fs.readFileSync(inputAbsolutePath, 'utf-8').split(/\r?\n/);

  let currentFileHeaderPath = null;
  let currentFileLines = [];

  /**
   * writeCurrentFile:
   *   Called when we finish reading one file block, or reach the end.
   *   - If extension is .json, we strip the first line (the header comment).
   */
  function writeCurrentFile() {
    if (currentFileHeaderPath && currentFileLines.length > 0) {
      const sanitized = sanitizePath(currentFileHeaderPath);
      if (!sanitized) return;

      const fullFilePath = path.join(restoreRoot, sanitized);
      const dirPath = path.dirname(fullFilePath);

      fs.mkdirSync(dirPath, { recursive: true });

      // Check if it's a JSON file
      if (path.extname(sanitized).toLowerCase() === '.json') {
        // Remove the first line, which is the comment header
        // Example: ["// File: something.json", "{", " ... }"]
        // or ["/* File: something.json */", "{", " ... }"]
        currentFileLines.shift();
      }

      fs.writeFileSync(fullFilePath, currentFileLines.join('\n'), 'utf-8');

      restoredFileCount++;
    }
  }

  for (const line of lines) {
    const maybePath = parseFileHeader(line);

    if (maybePath !== null) {
      // We found a new file boundary
      writeCurrentFile(); // finalize the previous file
      currentFileHeaderPath = maybePath;
      currentFileLines = [line]; // store the header line in memory
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

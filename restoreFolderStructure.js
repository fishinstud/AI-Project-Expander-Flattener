const fs = require('fs');
const path = require('path');


function parseFileHeader(line) {
  const trimmed = line.trimEnd();

  // 1) "// File: ..."
  if (trimmed.startsWith('// File:')) {
    return trimmed.substring('// File:'.length).trim() || null;
  }

  // 2) "/* File: ... */"
  if (trimmed.startsWith('/* File:')) {
    let pathPart = trimmed.substring('/* File:'.length).trim();
    if (pathPart.endsWith('*/')) {
      pathPart = pathPart.slice(0, -2).trim();
    }
    return pathPart || null;
  }

  // Not a file header
  return null;
}

/**
 * sanitizePath:
 *   Removes leading slashes or Windows drive letters (like "C:\") so we don't
 *   accidentally try to create directories at the root of the system.
 *   e.g. "/home/APEF/client/package.json" => "home/APEF/client/package.json"
 *        "C:\Users\someuser\file.js"     => "Users/someuser/file.js"
 */
function sanitizePath(filePath) {
  // Remove leading drive letters or slashes
  // e.g., "C:\Users" or "/home/APEF"
  return filePath.replace(/^([A-Za-z]:)?[\\/]+/, '');
}

/**
 * processOutputFile:
 *   - Reads lines from the aggregated text file (e.g., "GardenPlanner.txt").
 *   - Looks for lines that start with "// File:" or "/* File:" to detect each file's boundary.
 *   - Places each restored file in a "restored-data" subfolder (next to the .txt file),
 *     preserving the relative path segments if they exist, but stripping leading slashes.
 */
function processOutputFile(inputFilePath) {
  // 1) Resolve the absolute path to the .txt file
  const inputAbsolutePath = path.resolve(process.cwd(), inputFilePath);
  // 2) The base directory where the .txt file sits
  const baseDir = path.dirname(inputAbsolutePath);
  // 3) The "restored-data" folder we’ll create inside baseDir
  const restoreRoot = path.join(baseDir, 'restored-data');

  // Ensure "restored-data" exists
  fs.mkdirSync(restoreRoot, { recursive: true });

  // Read all lines from the .txt
  const fileLines = fs.readFileSync(inputAbsolutePath, 'utf-8').split(/\r?\n/);

  let currentFileHeaderPath = null;
  let currentFileLines = [];

  // Helper: write the current file to disk
  function writeCurrentFile() {
    if (currentFileHeaderPath && currentFileLines.length > 0) {
      // 1) Sanitize the path to remove leading slashes, etc.
      const sanitized = sanitizePath(currentFileHeaderPath);
      if (!sanitized) {
        // If there's nothing left, skip writing.
        // Or handle it differently if you want a default name.
        return;
      }

      // 2) Join "restored-data" + sanitized path
      const fullFilePath = path.join(restoreRoot, sanitized);
      const dirPath = path.dirname(fullFilePath);

      // 3) Recursively create subfolders
      fs.mkdirSync(dirPath, { recursive: true });

      // 4) Write the file content
      fs.writeFileSync(fullFilePath, currentFileLines.join('\n'), 'utf-8');
      // Optional: console.log(`Wrote file: ${fullFilePath}`);
    }
  }

  for (const line of fileLines) {
    const maybeHeaderPath = parseFileHeader(line);

    if (maybeHeaderPath !== null) {
      // Finalize the previous file, if any
      writeCurrentFile();

      // Start a new file
      currentFileHeaderPath = maybeHeaderPath;
      currentFileLines = [line]; // keep the header line as the first line
    } else {
      // Not a new file boundary -> add to the current file
      if (currentFileHeaderPath) {
        currentFileLines.push(line);
      }
    }
  }

  // Write the last file
  writeCurrentFile();
}

// CLI usage
if (process.argv.length < 3) {
  console.log("Usage: node restoreFolderStructure.js <output file path>");
  process.exit(1);
}

const inputFilePath = process.argv[2];
processOutputFile(inputFilePath);

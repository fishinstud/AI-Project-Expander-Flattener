const fs = require('fs');
const path = require('path');

const MAX_FILES = 1000;

const i18n = require('./i18n.json');
const ignoreConfig = require('./ignore.json');

/**
 * matchWildcard:
 *   Returns true if `str` matches the given shell-style wildcard `pattern`.
 */
function matchWildcard(str, pattern) {
  const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = '^' + pattern.split('*').map(escapeRegex).join('.*') + '$';
  return new RegExp(regexPattern).test(str);
}

/**
 * shouldIgnore:
 *   Checks if a given file or folder path should be ignored,
 *   based on the patterns in ignore.json.
 */
function shouldIgnore(filePath, isFolder = false) {
  const folderSeparator = filePath.includes('/') ? '/' : '\\';
  const fileOrFolderName = filePath.split(folderSeparator).at(-1);
  const { folders, files } = ignoreConfig;

  if (isFolder) {
    return folders.some(folderPattern =>
      folderPattern === fileOrFolderName || matchWildcard(fileOrFolderName, folderPattern)
    );
  } else {
    return files.some(filePattern =>
      filePattern === fileOrFolderName || matchWildcard(fileOrFolderName, filePattern)
    );
  }
}

/**
 * countFiles:
 *   Recursively counts files in a folder (ignoring any that match ignore.json).
 *   If the total count surpasses MAX_FILES, returns Infinity.
 */
function countFiles(folderPath) {
  let count = 0;
  const files = fs.readdirSync(folderPath);
  for (let file of files) {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile() && !shouldIgnore(filePath, true)) {
      count++;
    } else if (stats.isDirectory() && !shouldIgnore(filePath, true)) {
      count += countFiles(filePath);
    }
    if (count > MAX_FILES) {
      return Infinity;
    }
  }
  return count;
}

/**
 * getCommentHeader:
 *   Returns the appropriate comment style header based on file extension.
 *
 *   NOTE: We now treat `.json` specifically with a line-style comment:
 *     // File: ...
 *   instead of the block-style comment for CSS.
 */
function getCommentHeader(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();

  // For .json, explicitly use line-style comment
  if (ext === '.json') {
    return `// File: ${relativePath}\n`;
  }

  // Common CSS-like extensions (excluding .json now)
  const blockCommentExts = ['.css', '.scss', '.sass'];
  // Common JS/Java-like extensions
  const slashLike = ['.js', '.ts', '.java', '.jsx', '.tsx'];

  if (blockCommentExts.includes(ext)) {
    return `/* File: ${relativePath} */\n`;
  } else if (slashLike.includes(ext)) {
    return `// File: ${relativePath}\n`;
  } else {
    // Fallback
    return `// File: ${relativePath}\n`;
  }
}

/**
 * alreadyHasHeader:
 *   Returns true if the file's first line starts with "// File:" or "/* File:".
 */
function alreadyHasHeader(content) {
  const [firstLine] = content.split(/\r?\n/);
  if (!firstLine) return false;

  const trimmed = firstLine.trimStart();
  return trimmed.startsWith('// File:') || trimmed.startsWith('/* File:');
}

/**
 * processFolder:
 *   Recursively reads `folderPath`, ignoring files per ignore.json,
 *   and writes their contents into `outputPath`. Each file has a one-line
 *   comment header indicating the path, unless it already starts with that header.
 */
function processFolder({ folderPath, outputPath, lang = 'en' }) {
  const filesCount = countFiles(folderPath);
  if (filesCount > MAX_FILES) {
    console.log(`(${filesCount}) ${i18n[lang]['The number of files exceeds the limit of']} ${MAX_FILES}`);
    return;
  }

  // Create directories for outputPath if needed
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`${i18n[lang]['Starting writing output file']} ${outputPath}`);
  const output = fs.createWriteStream(outputPath);

  function processFile(filePath) {
    console.log(`${i18n[lang]['Writing file']} ${filePath}`);
    const relativePath = path.relative(process.cwd(), filePath);
    const fileContents = fs.readFileSync(filePath, 'utf-8');

    if (!alreadyHasHeader(fileContents)) {
      output.write(getCommentHeader(relativePath));
    }
    output.write(fileContents);
    output.write('\n'); // separate files
  }

  function processFolderRecursive(folderPath) {
    const files = fs.readdirSync(folderPath);
    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile() && !shouldIgnore(filePath)) {
        processFile(filePath);
      } else if (stats.isDirectory() && !shouldIgnore(filePath, true)) {
        processFolderRecursive(filePath);
      }
    });
  }

  processFolderRecursive(folderPath);
  output.end();
  console.log(`${i18n[lang]['Finished writing output file']} ${outputPath}`);
}

// CLI args
if (process.argv.length < 3) {
  console.log(`${i18n['en']['Usage']}`);
  process.exit(1);
}

const folderPath = process.argv.find(arg => arg.startsWith('folder=')).split('=')[1];
const outputPath = process.argv.find(arg => arg.startsWith('output=')).split('=')[1];
const lang = process.argv.find(arg => arg.startsWith('lang='))?.split('=')[1];

processFolder({ folderPath, outputPath, lang });

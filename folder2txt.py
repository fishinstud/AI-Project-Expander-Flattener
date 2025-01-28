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
 *   - For .css / .scss / .sass / .json => /* File: ... */
 *   - For .js / .ts / .java / .jsx / .tsx => // File: ...
 *   - Otherwise => // File: ...
 */
function getCommentHeader(relativePath) {
    const ext = path.extname(relativePath).toLowerCase();

    // Common CSS-like extensions (including JSON for block-style comment)
    const blockCommentExts = ['.css', '.scss', '.sass', '.json'];
    // Common JS/Java-like extensions
    const slashLike = ['.js', '.ts', '.java', '.jsx', '.tsx'];

    if (blockCommentExts.includes(ext)) {
        return `/* File: ${relativePath} */\n`;
    } else if (slashLike.includes(ext)) {
        return `// File: ${relativePath}\n`;
    } else {
        // Fallback to // for everything else
        return `// File: ${relativePath}\n`;
    }
}

/**
 * alreadyHasHeader:
 *   Returns true if the file's first line starts with "// File:" or "/* File:".
 */
function alreadyHasHeader(content) {
    // Split out just the first line; handle Windows or Unix line endings
    const [firstLine] = content.split(/\r?\n/);
    if (!firstLine) return false;

    const trimmed = firstLine.trimStart();
    return trimmed.startsWith('// File:') || trimmed.startsWith('/* File:');
}

/**
 * processFolder:
 *   Main function. Recursively reads folderPath, ignoring files as needed,
 *   writes them to outputPath with a comment header as the first line of each file
 *   IF the file does not already begin with such a header.
 */
function processFolder({ folderPath, outputPath, lang = 'en' }) {
    const filesCount = countFiles(folderPath);
    if (filesCount > MAX_FILES) {
        console.log(`(${filesCount}) ${i18n[lang]['The number of files exceeds the limit of']} ${MAX_FILES}`);
        return;
    }

    console.log(`${i18n[lang]['Starting writing output file']} ${outputPath}`);
    const output = fs.createWriteStream(outputPath);

    // Writes a single file’s (optional) header + content to the output
    function processFile(filePath) {
        console.log(`${i18n[lang]['Writing file']} ${filePath}`);
        const relativePath = path.relative(process.cwd(), filePath);
        const fileContents = fs.readFileSync(filePath, 'utf-8');

        // Check if the file already starts with a // File: or /* File:
        if (!alreadyHasHeader(fileContents)) {
            // If not, write a new header line
            output.write(getCommentHeader(relativePath));
        }

        // Then write the file content
        output.write(fileContents);
        // Add a newline at the end to separate from the next file
        output.write('\n');
    }

    // Recursively traverse the folder
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

    // Start recursive processing
    processFolderRecursive(folderPath);

    output.end();
    console.log(`${i18n[lang]['Finished writing output file']} ${outputPath}`);
}

// Read CLI args
if (process.argv.length < 3) {
    console.log(`${i18n['en']['Usage']}`);
    process.exit(1);
}

const folderPath = process.argv.find(arg => arg.startsWith('folder=')).split('=')[1];
const outputPath = process.argv.find(arg => arg.startsWith('output=')).split('=')[1];
const lang = process.argv.find(arg => arg.startsWith('lang='))?.split('=')[1];

processFolder({ folderPath, outputPath, lang });

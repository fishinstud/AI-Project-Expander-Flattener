const fs = require('fs');
const path = require('path');

// Create directories recursively if they don't exist
function createDirSync(dirPath) {
    const dirs = dirPath.split(path.sep);
    let currentPath = '';
    dirs.forEach((dir) => {
        currentPath = path.join(currentPath, dir);
        if (!fs.existsSync(currentPath)) {
            fs.mkdirSync(currentPath);
        }
    });
}

// This function will parse a line that starts with either:
//   "// File: relative/path.ext"
// or
//   "/* File: relative/path.ext */"
// and extract the "relative/path.ext" portion.
// We'll return null if it doesn't match those patterns.
function parseFileHeader(line) {
    // Trim right side, to ignore trailing spaces or \r
    const trimmed = line.trimEnd();

    // 1) Check if it starts with "// File:"
    if (trimmed.startsWith('// File:')) {
        // After "// File:" is the path
        const pathPart = trimmed.substring('// File:'.length).trim();
        return pathPart || null;
    }

    // 2) Check if it starts with "/* File:"
    if (trimmed.startsWith('/* File:')) {
        // After "/* File:" is the path
        let pathPart = trimmed.substring('/* File:'.length).trim();

        // If it ends with "*/", remove that
        if (pathPart.endsWith('*/')) {
            pathPart = pathPart.slice(0, -2).trim();
        }
        return pathPart || null;
    }

    // Not a header line
    return null;
}

/**
 * processOutputFile:
 *   Reads the aggregated text file line-by-line, detects file boundaries
 *   by lines that match our comment headers (// File: or /* File:),
 *   and recreates them on disk.
 *
 *   Importantly: the script keeps that header line as the first line
 *   in the file on disk (so the comment remains).
 */
function processOutputFile(inputFilePath) {
    const fileContent = fs.readFileSync(inputFilePath, 'utf-8');
    // Split on Windows or Unix line endings
    const lines = fileContent.split(/\r?\n/);

    let currentFilePath = null;
    let currentFileLines = [];

    // Writes the accumulated lines to disk
    function writeCurrentFile() {
        if (currentFilePath && currentFileLines.length > 0) {
            const fullFilePath = path.join(process.cwd(), currentFilePath);
            const dirPath = path.dirname(fullFilePath);

            createDirSync(dirPath);

            // Join the lines with '\n' so the final file has consistent line endings
            fs.writeFileSync(fullFilePath, currentFileLines.join('\n'), 'utf-8');
        }
    }

    for (const line of lines) {
        const maybePath = parseFileHeader(line);

        if (maybePath !== null) {
            // We found a new file header -> finalize the previous file
            writeCurrentFile();

            // Start a new file
            currentFilePath = maybePath;
            currentFileLines = [line]; // keep the header line in the file
        } else {
            // It's just a line of content for the current file
            if (currentFilePath) {
                currentFileLines.push(line);
            }
        }
    }

    // Finalize the last file
    writeCurrentFile();
}

// Usage
if (process.argv.length < 3) {
    console.log("Usage: node restoreFolderStructure.js <output file path>");
    process.exit(1);
}

const inputFilePath = process.argv[2];
processOutputFile(inputFilePath);

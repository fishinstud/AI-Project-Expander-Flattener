#!/usr/bin/env node

/**
 * stripUnwantedComments.js
 *
 * USAGE:
 *   node stripUnwantedComments.js inputFile.txt outputFile.txt
 *
 * DESCRIPTION:
 *   Reads 'inputFile.txt' line-by-line and writes to 'outputFile.txt',
 *   removing comments that don't match our recognized file separators:
 *      // File: ...
 *      /* File: ... */
 *      -- File: ...
 *   Also trims extra whitespace and collapses multiple blank lines.
 */

const fs = require('fs');
const path = require('path');

// Regexes that match recognized file-separator lines.
const recognizedSeparators = [
  /^\s*\/\/\s*File:\s*\S+/,
  /^\s*\/\*\s*File:\s*\S+.*\*\/\s*$/,
  /^\s*--\s*File:\s*\S+/
];

// Helper to check if a line is a recognized file-separator line:
function isRecognizedSeparator(line) {
  return recognizedSeparators.some(regex => regex.test(line));
}

// Helper to check if a line is any comment line (//, /*, --)
function isCommentLine(line) {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('--')
  );
}

// Main script
function stripUnwantedComments(inputFile, outputFile) {
  const content = fs.readFileSync(inputFile, 'utf-8');
  let lines = content.split(/\r?\n/);

  const filteredLines = [];
  let blankCount = 0; // track consecutive blank lines

  for (let line of lines) {
    // If it's a comment line but not recognized, skip it
    if (isCommentLine(line) && !isRecognizedSeparator(line)) {
      continue;
    }

    // Trim leading & trailing whitespace
    let trimmedLine = line.trim();

    // If the line is empty, track how many blank lines we've seen consecutively
    if (!trimmedLine) {
      blankCount++;
      // Only keep the first blank line, skip subsequent
      if (blankCount > 1) {
        continue;
      }
    } else {
      // reset the blank line counter since we have content
      blankCount = 0;
    }

    // Keep the line
    filteredLines.push(trimmedLine);
  }

  // Join everything with a single newline
  const finalOutput = filteredLines.join('\n');
  fs.writeFileSync(outputFile, finalOutput, 'utf-8');
  console.log(`Done! Wrote cleaned content to ${outputFile}`);
}

// CLI usage
if (process.argv.length < 4) {
  console.log('Usage: node stripUnwantedComments.js <inputFile> <outputFile>');
  process.exit(1);
}

const inputFile = path.resolve(process.cwd(), process.argv[2]);
const outputFile = path.resolve(process.cwd(), process.argv[3]);
stripUnwantedComments(inputFile, outputFile);

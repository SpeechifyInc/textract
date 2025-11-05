import { exec } from 'node:child_process';
import path from 'node:path';
import { pdfTextExtract } from '../pdf-text-extract/index.js';
import type { Options } from '../types.js';

/**
 * Extract text from a PDF file
 * @param filePath path to file
 * @param options options
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  options: Options,
): Promise<string> {
  // See https://github.com/dbashford/textract/issues/75 for description of
  // what is happening here
  const pdftotextOptions = options.pdftotextOptions ?? { layout: 'raw' };

  try {
    const pages = await pdfTextExtract(filePath, pdftotextOptions);
    return pages.join(' ').trim();
  } catch (error) {
    throw new Error(
      `Error extracting PDF text for file at [[ ${path.basename(
        filePath,
      )} ]], error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Test if pdftotext is installed
 * @param _options options (not used)
 * @returns true if pdftotext is installed
 */
async function testForBinary(_options: Options): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec('pdftotext -v', (error, _stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      if (stderr?.includes('pdftotext version')) {
        resolve(true);
        return;
      }

      reject(
        new Error(
          "INFO: 'pdftotext' does not appear to be installed, so textract will be unable to extract PDFs.",
        ),
      );
    });
  });
}

export default {
  types: ['application/pdf'],
  extract: extractText,
  test: testForBinary,
};

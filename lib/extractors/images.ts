import { exec } from 'node:child_process';
import type { Options } from '../types.js';
import util from '../util.js';

/**
 * Generate tesseract extraction command
 * @param inputFile input file
 * @param outputFile output file
 * @param options options
 * @returns tesseract extraction command
 */
function tesseractExtractionCommand(
  inputFile: string,
  outputFile: string,
  options?: Options,
): string {
  let cmd = `tesseract ${inputFile} ${outputFile}`;
  const tesseractOptions = options?.tesseract;
  if (tesseractOptions) {
    if ('lang' in tesseractOptions && tesseractOptions.lang) {
      cmd += ` -l ${tesseractOptions.lang}`;
    } else if ('cmd' in tesseractOptions && tesseractOptions.cmd) {
      cmd += ` ${tesseractOptions.cmd}`;
    }
  }
  cmd += ' quiet';
  return cmd;
}

/**
 * Extract text from an image
 * @param filePath path to image
 * @param options options
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  options?: Options,
): Promise<string> {
  const execOptions = util.createExecOptions('images', options);
  return util.runExecIntoFile(
    'tesseract',
    filePath,
    options,
    execOptions,
    tesseractExtractionCommand,
  );
}

/**
 * Test if tesseract is installed
 * @param _options options (not used)
 * @returns true if tesseract is installed
 */
async function testForBinary(_options?: Options): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec('tesseract', (error, stdout, stderr) => {
      // checking for content of help text
      if (
        error?.toString().includes('Usage:') ||
        stderr.includes('Usage:') ||
        stdout.includes('Usage:')
      ) {
        resolve(true);
        return;
      }
      const msg =
        "INFO: 'tesseract' does not appear to be installed, so textract will be unable to extract images.";
      reject(new Error(msg));
    });
  });
}

export default {
  types: ['image/png', 'image/jpeg', 'image/gif'],
  extract: extractText,
  test: testForBinary,
};

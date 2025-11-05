import { spawn, exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { Options } from '../types.ts';

// textutil -convert txt -stdout foo.doc
/**
 * Extract text from a DOC file using textutil
 * @param filePath path to file
 * @param _options options (not used)
 * @returns text from file
 */
async function extractText(
  filePath: string,
  _options?: Options,
): Promise<string> {
  let result = '';
  let error = '';

  return new Promise((resolve, reject) => {
    const textutil = spawn('textutil', [
      '-convert',
      'txt',
      '-stdout',
      filePath,
    ]);

    textutil.stdout.on('data', (buffer: Buffer) => {
      result += buffer.toString();
    });

    textutil.stderr.on('error', (buffer) => {
      error += buffer.toString();
    });

    textutil.on('close', (/* code */) => {
      if (error) {
        reject(
          new Error(
            `textutil read of file named [[ ${path.basename(filePath)} ]] failed: ${
              error
            }`,
          ),
        );
        return;
      }
      resolve(result.trim());
    });
  });
}

/**
 * Test if textutil is installed
 * @param _options options (not used)
 * @returns true if textutil is installed
 */
async function testForBinary(_options?: Options): Promise<boolean> {
  // just osx extractor, so don't bother checking on osx
  if (os.platform() !== 'darwin') {
    return true;
  }

  return new Promise((resolve, reject) => {
    exec(`textutil ${__filename}`, (error /* , stdout, stderr */) => {
      if (error !== null) {
        reject(
          new Error(
            `INFO: 'textutil' does not appear to be installed, so textract will be unable to extract DOCs.`,
          ),
        );
        return;
      }

      resolve(true);
    });
  });
}

export default {
  types:
    os.platform() === 'darwin'
      ? ['application/msword', 'application/rtf', 'text/rtf']
      : [],
  extract: extractText,
  test: testForBinary,
};

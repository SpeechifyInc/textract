import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { Options } from '../types.js';
import util from '../util.js';

/**
 * Extract text from a DOC file using antiword
 * @param filePath path to file
 * @param options options
 * @returns text from file
 */
async function extractText(
  filePath: string,
  options: Options,
): Promise<string> {
  const execOptions = util.createExecOptions('doc', options);

  return new Promise((resolve, reject) => {
    exec(
      `antiword -m UTF-8.txt "${filePath}"`,
      execOptions,
      (error, stdout /* , stderr */) => {
        if (!error) {
          const stdoutString = stdout.toString();
          resolve(stdoutString.trim().replaceAll('[pic]', ''));
          return;
        }

        if (error.toString().indexOf('is not a Word Document') > 0) {
          reject(
            new Error(
              `file named [[ ${path.basename(
                filePath,
              )} ]] does not appear to really be a .doc file`,
            ),
          );
          return;
        }

        reject(
          new Error(
            `antiword read of file named [[ ${path.basename(
              filePath,
            )} ]] failed: ${error.message}`,
          ),
        );
      },
    );
  });
}

/**
 * Test if antiword is installed
 * @param options options
 * @returns true if antiword is installed
 */
async function testForBinary(options: Options): Promise<boolean> {
  // just non-osx extractor
  if (os.platform() === 'darwin') {
    return true;
  }

  const execOptions = util.createExecOptions('doc', options);

  return new Promise((resolve, reject) => {
    exec(
      `antiword -m UTF-8.txt ${__filename}`,
      execOptions,
      (error /* , stdout, stderr */) => {
        let msg = '';
        if (error?.message?.includes('not found')) {
          msg =
            "INFO: 'antiword' does not appear to be installed, " +
            'so textract will be unable to extract DOCs.';
        } else if (error) {
          msg = error.message;
        }
        if (msg) {
          reject(new Error(msg));
          return;
        }
        resolve(true);
      },
    );
  });
}

export default {
  // let textutil handle .doc on osx
  types: os.platform() === 'darwin' ? [] : ['application/msword'],
  extract: extractText,
  test: testForBinary,
};

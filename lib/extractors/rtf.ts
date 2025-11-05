import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Options } from '../types.js';
import util from '../util.js';
import htmlExtract from './html.js';

/**
 * Extract text from a RTF file
 * @param filePath path to file
 * @param options options
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  options?: Options,
): Promise<string> {
  const execOptions = util.createExecOptions('rtf', options);
  const escapedPath = filePath.replace(/\s/g, '\\ ');
  // Going to output html from unrtf because unrtf does a great job of
  // going to html, but does a crap job of going to text. It leaves sections
  // out, strips apostrophes, leaves nasty quotes in for bullets and more
  // that I've likely not yet discovered.
  //
  // textract can go from html to text on its own, so let unrtf go to html
  // then extract the text from that
  //
  // Also do not have to worry about stripping comments from unrtf text
  // output since HTML comments are not included in output. Also, the
  // unrtf --quiet option doesn't work.
  return new Promise((resolve, reject) => {
    exec(
      `unrtf --html --nopict ${escapedPath}`,
      execOptions,
      (error, stdout /* , stderr */) => {
        if (error) {
          reject(
            new Error(
              `unrtf read of file named [[ ${path.basename(filePath)} ]] failed: ${
                error.message
              }`,
            ),
          );
          return;
        }

        const text = htmlExtract.extractFromText(stdout.toString().trim(), {});
        resolve(text);
      },
    );
  });
}

/**
 * Test if unrtf is installed
 * @param _options options (not used)
 * @returns true if unrtf is installed
 */
async function testForBinary(_options?: Options): Promise<boolean> {
  // just non-osx extractor
  if (os.platform() === 'darwin') {
    return true;
  }

  const filename = fileURLToPath(import.meta.url);

  return new Promise((resolve, reject) => {
    exec(`unrtf ${filename}`, (error /* , stdout, stderr */) => {
      if (error?.message?.includes('not found')) {
        reject(
          new Error(
            "INFO: 'unrtf' does not appear to be installed, " +
              'so textract will be unable to extract RTFs.',
          ),
        );
        return;
      }

      resolve(true);
    });
  });
}

export default {
  // rely on native tools on osx
  types: os.platform() === 'darwin' ? [] : ['application/rtf', 'text/rtf'],
  extract: extractText,
  test: testForBinary,
};

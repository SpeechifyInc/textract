import { exec } from 'node:child_process';
import path from 'node:path';
import type { Options } from '../types.js';
import util from '../util.js';

/**
 * Extract text from a DXF file
 * @param filePath path to file
 * @param options options
 * @returns text from file
 */
async function extractText(
  filePath: string,
  options?: Options,
): Promise<string> {
  const execOptions = util.createExecOptions('dxf', options);
  const escapedPath = filePath.replace(/\s/g, '\\ ');
  return new Promise((resolve, reject) => {
    exec(
      `drawingtotext ${escapedPath}`,
      execOptions,
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `error extracting DXF text ${path.basename(filePath)}: ${error.message}`,
            ),
          );
          return;
        }
        if (stderr !== '') {
          reject(
            new Error(
              `error extracting DXF text ${path.basename(filePath)}: ${stderr.toString()}`,
            ),
          );
          return;
        }
        resolve(stdout.toString());
      },
    );
  });
}

/**
 * Test if drawingtotext is installed
 * @param _options options (not used)
 * @returns true if drawingtotext is installed
 */
async function testForBinary(_options?: Options): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec('drawingtotext notalegalfile', (_error, _stdout, stderr) => {
      if (stderr?.includes("I couldn't make sense of your input")) {
        reject(
          new Error(
            "INFO: 'drawingtotext' does not appear to be installed, so textract will be unable to extract DXFs.",
          ),
        );
        return;
      }
      resolve(true);
    });
  });
}

export default {
  types: [
    'application/dxf',
    'application/x-autocad',
    'application/x-dxf',
    'drawing/x-dxf',
    'image/vnd.dxf',
    'image/x-autocad',
    'image/x-dxf',
    'zz-application/zz-winassoc-dxf',
  ],
  extract: extractText,
  test: testForBinary,
};

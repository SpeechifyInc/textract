import { exec, type ExecOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import type { Options } from './types.js';

const outDirPrefix = path.join(os.tmpdir(), 'textract-');
const replacements = [
  [/[\u201C|\u201D|]|â€œ|â€/g, '"'], // fancy double quotes
  [/[\u2018|\u2019]|â€™|â€˜]/g, "'"], // fancy single quotes/apostrophes
  [/â€¦/g, '…'], // elipses
  [/â€“|â€”/g, '–'], // long hyphen
] as const;

/**
 * Ensure the temporary directory exists
 * @returns void
 */
async function makeTemporaryDirectory(): Promise<string> {
  return fs.promises.mkdtemp(outDirPrefix);
}

/**
 * Replace nasty quotes with simple ones
 * @param text text to replace bad characters in
 * @returns text with bad characters replaced
 */
function replaceBadCharacters(text: string): string {
  let result = text;
  for (const [from, to] of replacements) {
    result = result.replace(from, to);
  }
  return result;
}

/**
 * Create an error for a Yauzl error message
 * @param err error
 * @returns error with message
 */
function yauzlError(err: Error) {
  let msg = err.message;
  if (msg === 'end of central directory record signature not found') {
    msg = `File not correctly recognized as zip file, ${msg}`;
  }
  return new Error(msg);
}

/**
 * Create exec options for an extractor
 * @param type extractor type
 * @param options options
 * @returns exec options
 */
function createExecOptions(
  type: 'doc' | 'dxf' | 'images',
  options: Options,
): ExecOptions {
  let execOptions: ExecOptions = {};
  if (options[type]?.exec) {
    return options[type].exec;
  } else if (options.exec) {
    execOptions = options.exec;
  }
  return execOptions;
}

/**
 * Check if unzip is installed
 * @param type extractor type
 * @returns true if unzip is installed
 */
async function unzipCheck(type: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    exec('unzip', (error /* , stdout, stderr */) => {
      if (error) {
        console.error(
          `textract: 'unzip' does not appear to be installed, ` +
            `so textract will be unable to extract ${type}.`,
        );
      }
      resolve(error === null);
    });
  });
}

/**
 * Get text from a zip file entry
 * @param zipfile zip file
 * @param entry zip file entry
 * @returns text from the entry
 */
async function getTextFromZipFile(
  zipfile: ZipFile,
  entry: Entry,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) {
        reject(err);
        return;
      }

      let text = '';
      let error = '';

      readStream.on('data', (chunk: string) => {
        text += chunk;
      });

      readStream.on('error', (streamError: Error) => {
        error += streamError.message;
      });

      readStream.on('end', () => {
        if (error.length > 0) {
          reject(new Error(error));
        } else {
          resolve(text);
        }
      });
    });
  });
}

/**
 * 1) builds an exec command using provided `genCommand` callback
 * 2) runs that command against an input file path
 * resulting in an output file
 * 3) reads that output file in
 * 4) cleans the output file up
 * 5) executes a callback with the contents of the file
 * @param label Name for the extractor, e.g. `Tesseract`
 * @param filePath path to file to be extractor
 * @param options extractor options as provided via user configuration
 * @param execOptions execution options passed to `exec` commmand as provided via user configuration
 * @param genCommand function used to generate the command to be executed
 * @returns text from the file
 */
async function runExecIntoFile(
  label: string,
  filePath: string,
  options: Options,
  execOptions: ExecOptions,
  genCommand: (
    options: Options,
    escapedFilePath: string,
    escapedFileTempOutPath: string,
  ) => string,
) {
  const outDir = await makeTemporaryDirectory();

  // escape the file paths
  const fileTempOutPath = path.join(
    outDir,
    path.basename(filePath, path.extname(filePath)),
  );
  const outFilePath = `${fileTempOutPath}.txt`;
  const escapedFilePath = filePath.replace(/\s/g, '\\ ');
  const escapedFileTempOutPath = fileTempOutPath.replace(/\s/g, '\\ ');
  const cmd = genCommand(options, escapedFilePath, escapedFileTempOutPath);

  await new Promise<void>((resolve, reject) => {
    exec(cmd, execOptions, (error /* , stdout, stderr */) => {
      if (error) {
        reject(
          new Error(
            `Error extracting [[ ${path.basename(filePath)} ]], exec error: ${
              error.message
            }`,
          ),
        );
        return;
      }
      resolve();
    });
  });

  try {
    // check if the output file exists
    await fs.promises.access(`${fileTempOutPath}.txt`);
  } catch (_error) {
    throw new Error(
      `Error reading ${label} output at [[ ${
        fileTempOutPath
      } ]], file does not exist`,
    );
  }

  let text: string;
  try {
    text = await fs.promises.readFile(outFilePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Error reading${label} output at [[ ${
        fileTempOutPath
      } ]], error: ${(error as Error).message}`,
    );
  }

  try {
    await fs.promises.unlink(outFilePath);
  } catch (error) {
    throw new Error(
      `Error, ${label}, cleaning up temp file [[ ${
        fileTempOutPath
      } ]], error: ${(error as Error).message}`,
    );
  }

  return text;
}

/**
 * Unpack a zip file
 * @param filePath path to zip file
 * @returns zip file
 */
async function unpackZipFile(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, (err, zipfile) => {
      if (err) {
        reject(yauzlError(err));
        return;
      }
      resolve(zipfile);
    });
  });
}

export default {
  createExecOptions,
  unzipCheck,
  getTextFromZipFile,
  yauzlError,
  runExecIntoFile,
  replaceBadCharacters,
  unpackZipFile,
};

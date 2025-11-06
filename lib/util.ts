import { exec, type ExecOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Input, Options } from './types.js';

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
export function replaceBadCharacters(text: string): string {
  let result = text;
  for (const [from, to] of replacements) {
    result = result.replace(from, to);
  }
  return result;
}

/**
 * Create exec options for an extractor
 * @param type extractor type
 * @param options options
 * @returns exec options
 */
export function createExecOptions(
  type: 'doc' | 'images' | 'rtf',
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
export async function runExecIntoFile(
  label: string,
  filePath: string,
  options: Options,
  execOptions: ExecOptions,
  genCommand: (
    escapedFilePath: string,
    escapedFileTempOutPath: string,
    options: Options,
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
  const cmd = genCommand(escapedFilePath, escapedFileTempOutPath, options);

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
 * Generate a random seed for the temporary file name
 * @returns random seed
 */
function genRandom() {
  return Math.floor(Math.random() * 100000000000 + 1).toString();
}

const tmpDir = os.tmpdir();

/**
 * Get the buffer from the input
 * @param input input
 * @returns buffer
 */
export async function getBufferInput(input: Input): Promise<Buffer> {
  if ('buffer' in input) {
    return input.buffer;
  }
  if ('filePath' in input) {
    const buffer = await fs.promises.readFile(input.filePath);
    return buffer;
  }
  throw new Error('Invalid input');
}

/**
 * Get the file path from the input
 * @param input input
 * @returns file path
 */
export async function getFilePathInput(
  input: Input,
): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  if ('filePath' in input) {
    return { filePath: input.filePath, cleanup: async () => {} };
  }
  if ('buffer' in input) {
    const filePath = path.join(tmpDir, `textract_file_${genRandom()}`);
    await fs.promises.writeFile(filePath, input.buffer);
    return {
      filePath,
      cleanup: async () => {
        await fs.promises.unlink(filePath);
      },
    };
  }
  throw new Error('Invalid input');
}

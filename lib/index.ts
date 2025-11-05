import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import extractBase from './extract.js';
import type { Options } from './types.js';

const tmpDir = os.tmpdir();

/**
 * Generate a random seed for the temporary file name
 * @returns random seed
 */
function genRandom() {
  return Math.floor(Math.random() * 100000000000 + 1).toString();
}

/**
 * Extract text from a buffer
 * @param mimeType mime type
 * @param buffer buffer
 * @param options options
 * @returns extracted text
 */
export async function extract(
  mimeType: string,
  buffer: Buffer,
  options: Options,
): Promise<string> {
  const fullPath = path.join(tmpDir, `textract_file_${genRandom()}`);
  await fs.promises.writeFile(fullPath, buffer);
  const text = await extractBase(mimeType, fullPath, options);
  await fs.promises.unlink(fullPath);
  return text;
}

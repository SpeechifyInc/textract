import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import type { Options } from '../types.js';

/**
 * Extract text from a text file
 * @param filePath path to file
 * @param _options options (not used)
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  _options: Options,
): Promise<string> {
  const data = await fs.promises.readFile(filePath);

  const detectedEncoding = jschardet.detect(data).encoding;
  if (!detectedEncoding) {
    throw new Error(
      `Could not detect encoding for file named [[ ${path.basename(
        filePath,
      )} ]]`,
    );
  }
  const encoding = detectedEncoding.toLowerCase();

  return iconv.decode(data, encoding);
}

export default {
  types: [/text\//, 'application/csv', 'application/javascript'],
  extract: extractText,
};

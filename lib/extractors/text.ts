import { decode } from 'iconv-lite';
import { detect } from 'jschardet';
import type { Options } from '../types.js';

/**
 * Extract text from a text file
 * @param buffer buffer
 * @param _options options (not used)
 * @returns extracted text
 */
function extractText(buffer: Buffer, _options: Options): string {
  const { encoding: detectedEncoding } = detect(buffer);
  if (!detectedEncoding) {
    throw new Error(`Could not detect encoding`);
  }
  const encoding = detectedEncoding.toLowerCase();

  return decode(buffer, encoding);
}

export default {
  inputKind: 'buffer' as const,
  types: [/text\//, 'application/csv', 'application/javascript'],
  extract: extractText,
};

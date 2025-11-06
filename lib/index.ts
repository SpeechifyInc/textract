import extractBase from './extract.js';
import type { Input, Options } from './types.js';

/**
 * Extract text from a buffer
 * @param mimeType mime type
 * @param input input
 * @param options options
 * @returns extracted text
 */
export async function extract(
  mimeType: string,
  input: Input,
  options: Options = {},
): Promise<string> {
  const text = await extractBase(mimeType, input, options);
  return text;
}

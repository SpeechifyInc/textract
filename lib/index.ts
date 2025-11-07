import mime from 'mime';
import extractBase from './extract.js';
import type { Options } from './types.js';

/**
 * Extract text from a buffer
 * @param buffer buffer
 * @param mimeType mime type
 * @param options options (optional)
 * @returns extracted text
 */
export async function extractFromBuffer(
  buffer: Buffer,
  mimeType: string,
  options: Options = {},
): Promise<string> {
  const text = await extractBase(mimeType, { buffer }, options);
  return text;
}

/**
 * Extract text from a file
 * @param filePath filePath
 * @param mimeType mime type (optional, if not provided, the mime type will be inferred from the file extension)
 * @param options options (optional)
 * @returns extracted text
 */
export async function extractFromFile(
  filePath: string,
  mimeType?: string,
  options: Options = {},
): Promise<string> {
  const effectiveMimeType = mimeType ?? mime.getType(filePath) ?? '';
  const text = await extractBase(effectiveMimeType, { filePath }, options);
  return text;
}

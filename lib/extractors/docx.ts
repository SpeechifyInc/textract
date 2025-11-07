import mammoth from 'mammoth';
import type { Options } from '../types.js';
import htmlExtract from './html.js';

/**
 * Extract text from a DOCX file
 * @param filePath path to file
 * @param options options
 * @returns text from file
 */
async function extractText(
  filePath: string,
  options: Options,
): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ path: filePath });
    return htmlExtract.extractFromString(value, options).trim();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Can't find end of central directory")
    ) {
      throw new Error(
        `File not correctly recognized as zip file, ${error.message}`,
      );
    }

    throw error;
  }
}

export default {
  inputKind: 'filePath' as const,
  types: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  extract: extractText,
};

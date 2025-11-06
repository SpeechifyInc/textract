import { marked } from 'marked';
import type { Options } from '../types.js';
import htmlExtract from './html.js';

/**
 * Extract text from a Markdown file
 * @param buffer buffer
 * @param options options
 * @returns extracted text
 */
async function extractText(buffer: Buffer, options: Options): Promise<string> {
  const parsed = await marked(buffer.toString());
  return htmlExtract.extractFromString(parsed, options);
}

export default {
  inputKind: 'buffer' as const,
  types: ['text/x-markdown', 'text/markdown'],
  extract: extractText,
};

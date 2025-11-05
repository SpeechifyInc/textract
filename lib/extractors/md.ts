import fs from 'node:fs';
import { marked } from 'marked';
import type { Options } from '../types.js';
import htmlExtract from './html.js';

/**
 * Extract text from a Markdown file
 * @param filePath path to file
 * @param options options
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  options?: Options,
): Promise<string> {
  const data = await fs.promises.readFile(filePath);
  const parsed = await marked(data.toString());
  return htmlExtract.extractFromString(parsed, options);
}

export default {
  types: ['text/x-markdown', 'text/markdown'],
  extract: extractText,
};

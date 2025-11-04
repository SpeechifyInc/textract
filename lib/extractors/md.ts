import fs from 'node:fs';
import marked from 'marked';
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
  options: Options,
): Promise<string> {
  const data = await fs.promises.readFile(filePath);

  return new Promise((resolve, reject) => {
    marked(data.toString(), (err: Error | null, content: string) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const extractedText = htmlExtract.extractFromText(content, options);
        resolve(extractedText);
      } catch (errInner) {
        reject(errInner as Error);
      }
    });
  });
}

export default {
  types: ['text/x-markdown', 'text/markdown'],
  extract: extractText,
};

import { EPub } from 'epub2';
import type { Options } from '../types.js';
import htmlExtract from './html.js';

EPub.libPromise = Promise;

/**
 * Extract text from an EPUB file
 * @param filePath path to file
 * @param options options
 * @returns text from file
 */
async function extractText(
  filePath: string,
  options: Options,
): Promise<string> {
  const epub = (await EPub.createAsync(filePath)) as EPub;

  let allText = '';

  for (const chapter of epub.flow) {
    if (!chapter.id) {
      continue;
    }
    const html = String(await epub.getChapterRawAsync(chapter.id));
    const text = htmlExtract.extractFromString(html, options);
    allText += text;
  }

  return allText;
}

export default {
  inputKind: 'filePath' as const,
  types: ['application/epub+zip'],
  extract: extractText,
};

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
  options?: Options,
): Promise<string> {
  const epub = (await EPub.createAsync(filePath)) as EPub;

  const getChapter = (chapterId: string) =>
    new Promise<string>((resolve, reject) => {
      epub.getChapterRaw(chapterId, (error, text) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(text ?? '');
      });
    });

  let allText = '';

  for (const chapter of epub.flow) {
    if (!chapter.id) {
      continue;
    }
    const html = await getChapter(chapter.id);
    const text = htmlExtract.extractFromString(html, options);
    allText += text;
  }

  return allText;
}

export default {
  types: ['application/epub+zip'],
  extract: extractText,
};

import EPub from 'epub2/node';
import type { Options } from '../types.js';
import htmlExtract from './html.js';

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
  const epub = new EPub(filePath);
  let allText = '';
  let chapterCount = 0;

  return new Promise((resolve, reject) => {
    const onTextExtract = (htmlExtractError: Error | null, outText: string) => {
      if (htmlExtractError) {
        reject(htmlExtractError);
        return;
      }

      allText += outText;
      chapterCount++;
      if (chapterCount === epub.flow.length) {
        resolve(allText);
      }
    };

    epub.on('end', () => {
      for (const chapter of epub.flow) {
        epub.getChapterRaw(
          chapter.id,
          (rawChaperError: Error | null, text: string) => {
            if (rawChaperError) {
              reject(rawChaperError);
              return;
            }

            // Extract the raw text from the chapter text (it's html)
            htmlExtract.extractFromText(text, options, onTextExtract);
          },
        );
      }
    });

    epub.parse();
  });
}

export default {
  types: ['application/epub+zip'],
  extract: extractText,
};

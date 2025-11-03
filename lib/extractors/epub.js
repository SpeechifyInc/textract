import EPub from 'epub2/node';
import htmlExtract from './html.js';

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function extractText(filePath, options, cb) {
  let epub = new EPub(filePath),
    allText = '',
    hasError = false,
    chapterCount = 0;
  epub.on('end', () => {
    // Iterate over each chapter...
    epub.flow.forEach((chapter) => {
      // if already error, don't do anything
      if (!hasError) {
        // Get the chapter text
        epub.getChapterRaw(chapter.id, (rawChaperError, text) => {
          if (rawChaperError) {
            hasError = true;
            cb(rawChaperError, null);
          } else {
            // Extract the raw text from the chapter text (it's html)
            htmlExtract.extractFromText(
              text,
              options,
              (htmlExtractError, outText) => {
                if (htmlExtractError) {
                  hasError = true;
                  cb(htmlExtractError, null);
                } else {
                  allText += outText;
                  chapterCount++;
                  if (chapterCount === epub.flow.length) {
                    cb(null, allText);
                  }
                }
              },
            );
          }
        });
      }
    });
  });

  epub.parse();
}

export default {
  types: ['application/epub+zip'],
  extract: extractText,
};

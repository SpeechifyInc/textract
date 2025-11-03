import fs from 'node:fs';
import marked from 'marked';
import htmlExtract from './html.js';

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function extractText(filePath, options, cb) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      cb(error, null);
      return;
    }

    marked(data.toString(), (err, content) => {
      if (err) {
        cb(err, null);
      } else {
        htmlExtract.extractFromText(content, options, cb);
      }
    });
  });
}

export default {
  types: ['text/x-markdown', 'text/markdown'],
  extract: extractText,
};

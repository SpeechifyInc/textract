import { DOMParser as Dom } from 'xmldom';
import xpath from 'xpath';
import yauzl from 'yauzl';
import util from '../util.js';

const includeRegex = /.xml$/;
const excludeRegex = /^(word\/media\/|word\/_rels\/)/;

/**
 *
 * @param inText
 * @param preserveLineBreaks
 */
function _calculateExtractedText(inText, preserveLineBreaks) {
  let doc = new Dom().parseFromString(inText),
    ps = xpath.select("//*[local-name()='p']", doc),
    text = '';
  ps.forEach((paragraph) => {
    let ts,
      localText = '';
    paragraph = new Dom().parseFromString(paragraph.toString());
    ts = xpath.select(
      "//*[local-name()='t' or local-name()='tab' or local-name()='br']",
      paragraph,
    );
    ts.forEach((t) => {
      if (t.localName === 't' && t.childNodes.length > 0) {
        localText += t.childNodes[0].data;
      } else if (t.localName === 'tab') {
        localText += ' ';
      } else if (t.localName === 'br') {
        if (preserveLineBreaks !== true) {
          localText += ' ';
        } else {
          localText += '\n';
        }
      }
    });
    text += `${localText}\n`;
  });

  return text;
}

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function extractText(filePath, options, cb) {
  let result = '';

  yauzl.open(filePath, (err, zipfile) => {
    let processEnd,
      processedEntries = 0;
    if (err) {
      util.yauzlError(err, cb);
      return;
    }

    processEnd = function () {
      let text;
      if (zipfile.entryCount === ++processedEntries) {
        if (result.length) {
          text = _calculateExtractedText(result, options.preserveLineBreaks);
          cb(null, text);
        } else {
          cb(
            new Error(
              'Extraction could not find content in file, are you' +
                ' sure it is the mime type it says it is?',
            ),
            null,
          );
        }
      }
    };

    zipfile.on('entry', (entry) => {
      if (
        includeRegex.test(entry.fileName) &&
        !excludeRegex.test(entry.fileName)
      ) {
        util.getTextFromZipFile(zipfile, entry, (err2, text) => {
          result += `${text}\n`;
          processEnd();
        });
      } else {
        processEnd();
      }
    });

    zipfile.on('error', (err3) => {
      cb(err3);
    });
  });
}

export default {
  types: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  extract: extractText,
};

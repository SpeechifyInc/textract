import * as cheerio from 'cheerio';
import type yauzl from 'yauzl';
import type { Options } from '../types.js';
import util from '../util.js';

/**
 * Extract text from a ODT file
 * @param filePath path to file
 * @param _options options (not used)
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  _options: Options,
): Promise<string> {
  const zipfile = await util.unpackZipFile(filePath);

  return new Promise((resolve, reject) => {
    zipfile.on('error', (errInner: Error) => {
      reject(errInner);
    });

    let textOnTheWay = false;

    const processEntry = async (entry: yauzl.Entry) => {
      if (entry.fileName !== 'content.xml') {
        return;
      }

      textOnTheWay = true;
      try {
        const text = await util.getTextFromZipFile(zipfile, entry);
        const output = text
          .replace('inflating: content.xml', '')
          .replace(/^(.Archive).*/, '')
          .replace(/text:p/g, 'textractTextNode')
          .replace(/text:h/g, 'textractTextNode')
          // remove empty nodes
          .replace(/<textractTextNode\/>/g, '')
          // remove empty nodes that have styles
          .replace(/<textractTextNode[^>]*\/>/g, '')
          .trim();
        const $ = cheerio.load(`<body>${output}</body>`);
        const nodes = $('textractTextNode');
        const nodeTexts = [];

        for (const node of nodes) {
          nodeTexts.push($(node).text());
        }

        resolve(nodeTexts.join('\n'));
      } catch (err2) {
        reject(err2 as Error);
      }
    };

    zipfile.on('end', () => {
      if (!textOnTheWay) {
        reject(
          new Error(
            'Extraction could not find content.xml in file, are you sure it is the mime type it says it is?',
          ),
        );
      }
    });

    zipfile.on('entry', (entry: yauzl.Entry) => {
      void processEntry(entry);
    });
  });
}

export default {
  types: [
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.text-template',
    'application/vnd.oasis.opendocument.graphics',
    'application/vnd.oasis.opendocument.graphics-template',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.presentation-template',
  ],
  extract: extractText,
};

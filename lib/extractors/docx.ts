import { DOMParser as Dom } from 'xmldom';
import xpath from 'xpath';
import type yauzl from 'yauzl';
import type { Options } from '../types.js';
import util from '../util.js';

const includeRegex = /.xml$/;
const excludeRegex = /^(word\/media\/|word\/_rels\/)/;

/**
 * Calculate extracted text from a DOCX file content
 * @param inText text to parse
 * @param preserveLineBreaks whether to preserve line breaks
 * @returns extracted text
 */
function calculateExtractedText(inText: string, preserveLineBreaks: boolean) {
  const doc = new Dom().parseFromString(inText);
  const ps = xpath.select("//*[local-name()='p']", doc);

  let text = '';
  for (const paragraph of ps) {
    const paragraphElement = new Dom().parseFromString(paragraph.toString());
    const ts = xpath.select(
      "//*[local-name()='t' or local-name()='tab' or local-name()='br']",
      paragraphElement,
    );
    let localText = '';
    for (const t of ts) {
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
    }
    text += `${localText}\n`;
  }

  return text;
}

/**
 * Extract text from a DOCX file
 * @param filePath path to file
 * @param options options
 * @returns text from file
 */
async function extractText(
  filePath: string,
  options: Options,
): Promise<string> {
  const zipfile = await util.unpackZipFile(filePath);

  let result = '';

  return new Promise((resolve, reject) => {
    zipfile.on('error', (errInner: Error) => {
      reject(errInner);
    });

    let processedEntries = 0;

    const processEnd = () => {
      if (zipfile.entryCount === ++processedEntries) {
        if (!result.length) {
          reject(
            new Error(
              'Extraction could not find content in file, are you sure it is the mime type it says it is?',
            ),
          );
          return;
        }

        resolve(
          calculateExtractedText(result, options.preserveLineBreaks ?? false),
        );
      }
    };

    const processEntry = async (entry: yauzl.Entry) => {
      if (
        includeRegex.test(entry.fileName) &&
        !excludeRegex.test(entry.fileName)
      ) {
        try {
          const entryText = await util.getTextFromZipFile(zipfile, entry);
          result += `${entryText}\n`;
          processEnd();
        } catch (errInner) {
          reject(errInner as Error);
        }
      } else {
        processEnd();
      }
    };

    zipfile.on('entry', (entry: yauzl.Entry) => {
      void processEntry(entry);
    });
  });
}

export default {
  types: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  extract: extractText,
};

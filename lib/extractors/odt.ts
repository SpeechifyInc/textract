import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import type { Options } from '../types.js';

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
  const buffer = await fs.readFile(filePath);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (unknownError) {
    if (unknownError instanceof Error) {
      if (unknownError.message?.includes('End of central directory')) {
        throw new Error(
          `File not correctly recognized as zip file, ${unknownError.message}`,
        );
      }
      throw unknownError;
    }
    throw new Error('Unknown error while reading ODT file');
  }

  const content = zip.file('content.xml');
  if (!content) {
    throw new Error(
      'Extraction could not find content.xml in file, are you sure it is the mime type it says it is?',
    );
  }

  const text = await content.async('string');
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
  const nodeTexts: string[] = [];
  for (const node of nodes) {
    nodeTexts.push($(node).text());
  }

  return nodeTexts.join('\n');
}

export default {
  inputKind: 'filePath' as const,
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

import fs from 'node:fs';
import { load, type CheerioAPI, type Cheerio } from 'cheerio';
// eslint-disable-next-line n/no-unpublished-import
import type { AnyNode } from 'domhandler';
import type { Options } from '../types.js';

/**
 * Get text with alt text
 * @param $ cheerio API
 * @param $element cheerio element
 * @returns text with alt text
 */
function getTextWithAlt<T extends AnyNode>(
  $: CheerioAPI,
  $element: Cheerio<T>,
): string {
  if (!$element) {
    return '';
  }

  if ($element.is('img')) {
    return ` ${$element.attr('alt')} `;
  }

  if ($element.is('input')) {
    return $element.attr('value') ?? '';
  }

  return $element
    .contents()
    .map((_i, domElement) => {
      if (domElement.nodeType === 3) {
        return domElement.data;
      }

      if (domElement.nodeType === 1) {
        const $innerElement = $(domElement);
        if (
          $innerElement.is('img, input') ||
          $innerElement.find('img[alt], input[value]').length > 0
        ) {
          return getTextWithAlt($, $innerElement);
        } else {
          return $innerElement.text();
        }
      }

      return '';
    })
    .get()
    .join('');
}

/**
 * Extract text from HTML
 * @param data HTML data
 * @param options options
 * @returns extracted text
 */
export function extractFromString(data: string, options?: Options): string {
  const text = data
    .replace(
      /< *(br|p|div|section|aside|button|header|footer|li|article|blockquote|cite|code|h1|h2|h3|h4|h5|h6|legend|nav)((.*?)>)/g,
      '<$1$2|||||',
    )
    .replace(/< *\/(td|a|option) *>/g, ' </$1>') // spacing some things out so text doesn't get smashed together
    .replace(/< *(a|td|option)/g, ' <$1') // spacing out links
    .replace(/< *(br|hr) +\/>/g, '|||||<$1\\>')
    .replace(
      /<\/ +?(p|div|section|aside|button|header|footer|li|article|blockquote|cite|code|h1|h2|h3|h4|h5|h6|legend|nav)>/g,
      '|||||</$1>',
    );

  const wrappedText = `<textractwrapper>${text}<textractwrapper>`;

  const $ = load(wrappedText);
  $('script').remove();
  $('style').remove();
  $('noscript').remove();

  const $docElement = $('textractwrapper');

  let extractedText: string;

  if (options?.includeAltText) {
    extractedText = getTextWithAlt($, $docElement);
  } else {
    extractedText = $docElement.text();
  }

  extractedText = extractedText
    .replace(/\|\|\|\|\|/g, '\n')
    .replace(/(\n\u00A0|\u00A0\n|\n | \n)+/g, '\n')
    .replace(/(\r\u00A0|\u00A0\r|\r | \r)+/g, '\n')
    .replace(/(\v\u00A0|\u00A0\v|\v | \v)+/g, '\n')
    .replace(/(\t\u00A0|\u00A0\t|\t | \t)+/g, '\n')
    .replace(/[\n\r\t\v]+/g, '\n');

  return extractedText;
}

/**
 * Extract text from HTML file
 * @param filePath path to file
 * @param options options
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  options?: Options,
): Promise<string> {
  const data = await fs.promises.readFile(filePath);
  return extractFromString(data.toString(), options);
}

export default {
  types: [
    'text/html',
    'text/xml',
    'application/xml',
    'application/rss+xml',
    'application/atom+xml',
  ],
  extract: extractText,
  extractFromString,
};

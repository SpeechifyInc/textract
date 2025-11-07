import { decode } from 'html-entities';
import extractors, { type Extractor } from './extractors/index.js';
import type { Input, Options } from './types.js';
import {
  getBufferInput,
  getFilePathInput,
  replaceBadCharacters,
} from './util.js';

const STRIP_ONLY_SINGLE_LINEBREAKS = /(^|[^\n])\n(?!\n)/g;
const WHITELIST_PRESERVE_LINEBREAKS =
  /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 .,?""!@#$%^&*()-_=+;:<>/\\|}{[\]`~'-\w\n\r]*/g;
const WHITELIST_STRIP_LINEBREAKS =
  /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 .,?""!@#$%^&*()-_=+;:<>/\\|}{[\]`~'-\w]*/g;

const registeredExtractors = new Map<string, Extractor>();
const failedExtractors = new Map<Extractor, string>();
const initializedExtractors = new Set<Extractor>();

/**
 * Check if a type or regex matches a mime type
 * @param type type
 * @param mimeType mime type
 * @returns true if the type matches the mime type, false otherwise
 */
function matches(type: string | RegExp, mimeType: string): boolean {
  if (typeof type === 'string') {
    return mimeType.toLowerCase() === type.toLowerCase();
  }
  return mimeType.match(type) !== null;
}

/**
 * Find an extractor by mime type
 * @param mimeType mime type
 * @param options options
 * @returns extractor
 */
async function findExtractor(
  mimeType: string,
  options: Options,
): Promise<Extractor | undefined> {
  console.debug(`findExtractor for mime type: [[ ${mimeType} ]]`);

  if (registeredExtractors.has(mimeType)) {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] found in registeredExtractors`,
    );
    return registeredExtractors.get(mimeType);
  }

  const matchingExtractor = extractors.find((extractor) =>
    extractor.types.some((type) => matches(type, mimeType)),
  );
  if (!matchingExtractor) {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] not found in extractors`,
    );
    return undefined;
  }
  if (failedExtractors.has(matchingExtractor)) {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] failed to initialize earlier`,
    );
    throw new Error(
      `Extractor for type: [[ ${mimeType} ]] failed to initialize. Message: ${failedExtractors.get(matchingExtractor)}`,
    );
  }

  let initialized: boolean;
  if (initializedExtractors.has(matchingExtractor)) {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] already initialized for a different mime type`,
    );
    registeredExtractors.set(mimeType, matchingExtractor);
    return matchingExtractor;
  }

  try {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] initializing`,
    );
    if (matchingExtractor.test) {
      initialized = await matchingExtractor.test(options);
    } else {
      initialized = true;
    }
  } catch (error) {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] failed to initialize`,
    );
    failedExtractors.set(
      matchingExtractor,
      error instanceof Error ? error.message : 'Unknown error',
    );
    throw new Error(
      `Extractor for type: [[ ${mimeType} ]] failed to initialize. Message: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  if (!initialized) {
    console.debug(
      `findExtractor for mime type: [[ ${mimeType} ]] failed to initialize`,
    );
    failedExtractors.set(matchingExtractor, 'Extractor failed to initialize');
    throw new Error(
      `Extractor for type: [[ ${mimeType} ]] failed to initialize. Message: ${failedExtractors.get(matchingExtractor)}`,
    );
  }

  console.debug(`findExtractor for mime type: [[ ${mimeType} ]] initialized`);
  initializedExtractors.add(matchingExtractor);
  registeredExtractors.set(mimeType, matchingExtractor);
  return matchingExtractor;
}

// global, all file type, content cleansing
/**
 * Clean up text
 * @param inputText input text
 * @param options options
 * @returns cleaned text
 */
function cleanText(inputText: string, options: Options): string {
  // clean up text
  let text = replaceBadCharacters(inputText);

  if (options.preserveLineBreaks || options.preserveOnlyMultipleLineBreaks) {
    if (options.preserveOnlyMultipleLineBreaks) {
      text = text.replace(STRIP_ONLY_SINGLE_LINEBREAKS, '$1 ').trim();
    }
    text = text.replace(WHITELIST_PRESERVE_LINEBREAKS, ' ');
  } else {
    text = text.replace(WHITELIST_STRIP_LINEBREAKS, ' ');
  }

  // multiple spaces, tabs, vertical tabs, non-breaking space]
  text = text.replace(/ (?! )/g, '').replace(/[ \t\v\u00A0]{2,}/g, ' ');

  return decode(text);
}

/**
 * Extract text from a file
 * @param mimeType mime type
 * @param input input
 * @param options options
 * @returns extracted text
 */
export default async function extract(
  mimeType: string,
  input: Input,
  options: Options,
): Promise<string> {
  let extractor: Extractor | undefined;

  try {
    extractor = await findExtractor(mimeType, options);
  } catch (error) {
    if (
      error instanceof Error &&
      (error as Error & { typeNotFound: boolean }).typeNotFound
    ) {
      throw error;
    }
    (error as Error & { typeNotFound: boolean }).typeNotFound = true;
    throw error;
  }

  if (!extractor) {
    // cannot extract this file type
    const msg = `Error for type: [[ ${mimeType} ]], extractor not found`;
    const error = new Error(msg);
    (error as Error & { typeNotFound: boolean }).typeNotFound = true;
    throw error;
  }

  let text: string;

  if (extractor.inputKind === 'filePath') {
    const { filePath, cleanup } = await getFilePathInput(input);
    text = await extractor.extract(filePath, options);
    await cleanup();
  } else {
    const buffer = await getBufferInput(input);
    text = await extractor.extract(buffer, options);
  }

  return cleanText(text, options);
}

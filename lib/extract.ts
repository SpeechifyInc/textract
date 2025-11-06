import { decode } from 'html-entities';
import extractors, { type Extractor } from './extractors/index.js';
import type { Input, Options } from './types.js';
import {
  getBufferInput,
  getFilePathInput,
  replaceBadCharacters,
} from './util.js';

let hasInitialized = false;
const STRIP_ONLY_SINGLE_LINEBREAKS = /(^|[^\n])\n(?!\n)/g;
const WHITELIST_PRESERVE_LINEBREAKS =
  /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 .,?""!@#$%^&*()-_=+;:<>/\\|}{[\]`~'-\w\n\r]*/g;
const WHITELIST_STRIP_LINEBREAKS =
  /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 .,?""!@#$%^&*()-_=+;:<>/\\|}{[\]`~'-\w]*/g;

const typeExtractors: Record<string, Extractor> = {};

const regexExtractors: {
  regexp: RegExp;
  extractor: Extractor;
}[] = [];

const failedExtractorTypes: Record<string, string> = {};

/**
 * Register an extractor
 * @param extractor extractor to register
 */
function registerExtractor(extractor: Extractor) {
  for (const type of extractor.types) {
    if (typeof type === 'string') {
      const normalizedType = type.toLowerCase();
      typeExtractors[normalizedType] = extractor;
    } else if (type instanceof RegExp) {
      regexExtractors.push({ regexp: type, extractor });
    }
  }
}

/**
 * Register a failed extractor
 * @param extractor extractor that failed to initialize
 * @param failedMessage message to register
 */
function registerFailedExtractor(extractor: Extractor, failedMessage: string) {
  for (const type of extractor.types) {
    failedExtractorTypes[type.toString().toLowerCase()] = failedMessage;
  }
}

/**
 * Try to register an extractor
 * @param extractor extractor to try to register
 * @param options options to pass to the extractor
 */
async function tryRegisterExtractor(extractor: Extractor, options: Options) {
  try {
    const passedTest = (await extractor.test?.(options)) ?? true;
    if (passedTest) {
      registerExtractor(extractor);
    } else {
      registerFailedExtractor(extractor, 'Extractor failed to initialize');
    }
  } catch (error) {
    registerFailedExtractor(extractor, (error as Error).message);
  }
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
 * Initialize extractors
 * @param options options
 * @returns void
 */
async function initializeExtractors(options: Options) {
  hasInitialized = true;

  // perform any binary tests to ensure extractor is possible
  // given execution environment
  for (const extractor of extractors) {
    if (extractor.test) {
      await tryRegisterExtractor(extractor, options);
    } else {
      registerExtractor(extractor);
    }
  }
}

/**
 * Find an extractor by mime type
 * @param mimeType mime type
 * @returns extractor
 */
function findExtractor(mimeType: string): Extractor | undefined {
  const normalizedFileType = mimeType.toLowerCase();
  if (typeExtractors[normalizedFileType]) {
    return typeExtractors[normalizedFileType];
  }

  for (const regexExtractor of regexExtractors) {
    if (normalizedFileType.match(regexExtractor.regexp)) {
      return regexExtractor.extractor;
    }
  }

  return undefined;
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
  if (!hasInitialized) {
    await initializeExtractors(options);
  }

  const extractor = findExtractor(mimeType);

  if (!extractor) {
    // cannot extract this file type
    let msg = `Error for type: [[ ${mimeType} ]], mimeType: [[ ${mimeType} ]]`;

    // update error message if type is supported but just not configured/installed properly
    if (failedExtractorTypes[mimeType]) {
      msg += `, extractor for type exists, but failed to initialize. Message: ${failedExtractorTypes[mimeType]}`;
    }

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

import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import type { Options } from '../types.js';

const xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: false });

/**
 * Compare two numbers
 * @param a first number
 * @param b second number
 * @returns -1 if a is less than b, 1 if a is greater than b, 0 if a is equal to b
 */
function compareNumbers(a: number, b: number) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Check if a key is a paragraph key
 * @param key key to check
 * @returns true if the key is a paragraph key, false otherwise
 */
function isParagraphKey(key: string): boolean {
  return key === 'p' || key.endsWith(':p');
}

/**
 * Check if a key is a text key
 * @param key key to check
 * @returns true if the key is a text key, false otherwise
 */
function isTextKey(key: string): boolean {
  return key === 't' || key.endsWith(':t');
}

/**
 * Check if a key is a break or tab key
 * @param key key to check
 * @returns true if the key is a break or tab key, false otherwise
 */
function isBreakOrTabKey(key: string): boolean {
  return (
    key.endsWith(':br') || key.endsWith(':tab') || key === 'br' || key === 'tab'
  );
}

/**
 * Convert a paragraph node to text
 * @param pNode paragraph node
 * @returns text of the paragraph
 */
function paragraphToText(pNode: unknown): string {
  const texts: string[] = [];

  const collectTexts = (node: unknown) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const child of node) collectTexts(child);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        if (isTextKey(key)) {
          if (typeof value === 'string') {
            texts.push(value);
          }
          // if value is object, ignore; parser typically yields string for text
        } else if (isBreakOrTabKey(key)) {
          // ignore; legacy extractor treated br/tab as no-op inside paragraph
        } else {
          collectTexts(value);
        }
      }
    }
  };

  collectTexts(pNode);
  return texts.join('');
}

/**
 * Extract paragraphs from an object
 * @param obj object to extract paragraphs from
 * @param out array to store the paragraphs
 * @param includeBlank whether to include blank paragraphs
 */
function extractParagraphs(obj: unknown, out: string[], includeBlank: boolean) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    for (const item of obj) extractParagraphs(item, out, includeBlank);
    return;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isParagraphKey(key)) {
        if (Array.isArray(value)) {
          for (const p of value) {
            const t = paragraphToText(p);
            // eslint-disable-next-line max-depth
            if (t.length > 0 || includeBlank) {
              out.push(t);
            }
          }
        } else {
          const t = paragraphToText(value);
          if (t.length > 0 || includeBlank) out.push(t);
        }
      } else {
        extractParagraphs(value, out, includeBlank);
      }
    }
  }
}

/**
 * Extract text from a slide XML
 * @param xml XML to extract text from
 * @param includeBlank whether to include blank paragraphs
 * @returns text from the slide
 */
function extractTextFromSlideXml(xml: string, includeBlank: boolean): string {
  const obj = xmlParser.parse(xml) as unknown;
  const paragraphs: string[] = [];
  extractParagraphs(obj, paragraphs, includeBlank);
  const s = paragraphs.map((p) => `${p}\n`).join('');
  return s.replace(/\n+$/g, '\n');
}

/**
 * Extract text from a PPTX file
 * @param buffer buffer
 * @param options options
 * @returns extracted text
 */
async function extractText(buffer: Buffer, options: Options): Promise<string> {
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
    throw new Error('Unknown error while reading PPTX file');
  }

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .map((name) => {
      const m = /slide(\d+)\.xml$/.exec(name);
      return { name, index: Number(m?.[1] ?? NaN) };
    })
    .filter((s) => Number.isFinite(s.index))
    .sort((a, b) => compareNumbers(a.index, b.index));

  const notesFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
    .map((name) => {
      const m = /notesSlide(\d+)\.xml$/.exec(name);
      return { name, index: Number(m?.[1] ?? NaN) };
    })
    .filter((s) => Number.isFinite(s.index))
    .sort((a, b) => compareNumbers(a.index, b.index));

  if (slideFiles.length === 0) {
    throw new Error(
      'Extraction could not find slides in file, are you sure it is the mime type it says it is?',
    );
  }

  const includeBlank = Boolean(
    options.preserveLineBreaks || options.preserveOnlyMultipleLineBreaks,
  );
  const slideTexts: Map<number, string> = new Map<number, string>();
  for (const { name, index } of slideFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    slideTexts.set(index, extractTextFromSlideXml(xml, includeBlank));
  }

  const notesTexts: Map<number, string> = new Map<number, string>();
  for (const { name, index } of notesFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    notesTexts.set(index, extractTextFromSlideXml(xml, includeBlank));
  }

  const parts: string[] = [];
  for (const { index } of slideFiles) {
    const s = slideTexts.get(index);
    if (s) parts.push(s);
    const n = notesTexts.get(index);
    if (n) {
      parts.push(n);
      // Some presentations include slide number in notes. Legacy extractor captured it; add index explicitly.
      parts.push(`${index} `);
    }
  }

  return parts.join('');
}

export default {
  inputKind: 'buffer' as const,
  types: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.template',
  ],
  extract: extractText,
};

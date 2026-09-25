import { decode } from 'html-entities';
import { describe, it, expect } from 'vitest';
import { cleanText } from '../lib/extract.js';
import type { Options } from '../lib/types.js';
import { replaceBadCharacters } from '../lib/util.js';

// cleanText as it shipped up to 3.1.3, kept as the reference the rewritten whitespace step must match.
const LEGACY_PRESERVE_LINEBREAKS =
  /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 .,?""!@#$%^&*()-_=+;:<>/\\|}{[\]`~'-\w\n\r]*/g;
const LEGACY_STRIP_LINEBREAKS =
  /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 .,?""!@#$%^&*()-_=+;:<>/\\|}{[\]`~'-\w]*/g;

const legacyCleanText = (inputText: string, options: Options): string => {
  let text = replaceBadCharacters(inputText);
  if (options.preserveLineBreaks || options.preserveOnlyMultipleLineBreaks) {
    if (options.preserveOnlyMultipleLineBreaks) {
      text = text.replace(/(^|[^\n])\n(?!\n)/g, '$1 ').trim();
    }
    text = text.replace(LEGACY_PRESERVE_LINEBREAKS, ' ');
  } else {
    text = text.replace(LEGACY_STRIP_LINEBREAKS, ' ');
  }
  text = text.replace(/ (?! )/g, '').replace(/[ \t\v\u00A0]{2,}/g, ' ');
  return decode(text);
};

const ALPHABET = [
  'a',
  'Z',
  '9',
  ' ',
  ' ',
  ' ',
  '\n',
  '\n',
  '\r',
  '\t',
  '\v',
  '\u00A0',
  '.',
  ',',
  '"',
  '\u201C',
  '\u2019',
  '\u2014',
  'é',
  'ж',
  '中',
  'مر',
  '😀',
  '\u0001',
  '\u200B',
  '\uFEFF',
  '~',
  '|',
  '–',
  '&amp;',
  '&#8217;',
  'â€œ',
];

// Deterministic, so a failure reproduces.
const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const MODES: Options[] = [
  {},
  { preserveLineBreaks: true },
  { preserveOnlyMultipleLineBreaks: true },
];

describe('cleanText', () => {
  it.each(MODES)(
    'will match the shipped output on random text with options %j',
    (options) => {
      const random = mulberry32(12062);
      const inputs = Array.from({ length: 3000 }, () =>
        Array.from(
          { length: Math.floor(random() * 30) },
          () => ALPHABET[Math.floor(random() * ALPHABET.length)],
        ).join(''),
      );
      const mismatches = inputs.filter(
        (input) =>
          cleanText(input, options) !== legacyCleanText(input, options),
      );
      expect(mismatches).toEqual([]);
    },
  );
});

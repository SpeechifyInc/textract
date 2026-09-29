import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Options } from '../../types.js';
import { normalizeLineBreaks } from '../html.js';
import { readLists } from './lists.js';
import {
  findPartPath,
  readRelationships,
  RELATIONSHIP_TYPE,
  splitPath,
} from './package.js';
import {
  BLOCK,
  NOTE_REFERENCE,
  PartReader,
  type NoteReference,
  type NoteType,
} from './reader.js';
import { streamXml } from './xml.js';

/**
 * DOCX text is read by streaming word/document.xml through a SAX parser, keeping only text. The previous
 * mammoth.convertToHtml path built an object for every paragraph and run before any text came out: a 2 MB,
 * 50k-paragraph Word file needed ~3.7 GB of heap and took down the 2 GB service worker reading it (PLA-12062).
 *
 * The output reproduces what that path produced (mammoth's HTML read back by the HTML extractor), so callers see
 * the same text:
 * - only the elements mammoth reads are read; anything else, with its content, is skipped, as mammoth does;
 * - `|||||` block markers go where the HTML extractor put them (at the start of paragraphs and list items, and at
 *   line breaks) and spaces where it spaced out tags (links, table cells, bookmarks);
 * - note references become `[n]`, and the referenced footnotes and endnotes follow the body with a `↑`.
 *
 * Where each part lives:
 * - index.ts: this extractor; finds the parts, reads the body, then the notes, and numbers them;
 * - reader.ts: PartReader, which turns one streamed part into text, element by element;
 * - properties.ts: property elements, alternate content and drawings, read for a few attributes only;
 * - lists.ts: styles.xml and numbering.xml, and which paragraphs are list items;
 * - tables.ts: header rows, merged cells and cell spacing;
 * - fields.ts: complex field instructions (hyperlinks, checkboxes);
 * - frames.ts: the reader's stack of open elements;
 * - package.ts: relationships and part lookup;
 * - xml.ts: namespace resolution, line endings, and parsing a part whole or streamed.
 */

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
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readFile(filePath));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Can't find end of central directory")
    ) {
      throw new Error(
        `File not correctly recognized as zip file, ${error.message}`,
      );
    }
    throw error;
  }

  const documentPath = findPartPath(
    zip,
    await readRelationships(zip, ''),
    `${RELATIONSHIP_TYPE}officeDocument`,
    '',
    'word/document.xml',
  );
  const documentFile = zip.file(documentPath);
  if (!documentFile) {
    throw new Error(
      'Could not find main document part. Are you sure this is a valid .docx file?',
    );
  }

  const noteReferences: NoteReference[] = [];
  const documentRelationships = await readRelationships(zip, documentPath);
  const relatedPart = (name: string): string =>
    findPartPath(
      zip,
      documentRelationships,
      `${RELATIONSHIP_TYPE}${name}`,
      splitPath(documentPath).dirname,
      `word/${name}.xml`,
    );
  const partText = async (name: string): Promise<string | undefined> =>
    zip.file(relatedPart(name))?.async('string');
  const lists = readLists(
    await partText('styles'),
    await partText('numbering'),
  );
  const body = new PartReader(
    options,
    noteReferences,
    false,
    documentRelationships.byId,
    lists,
  );
  await streamXml(documentFile.nodeStream('nodebuffer'), body);
  if (!body.sawBody) {
    throw new Error(
      'Could not find the body element: are you sure this is a docx file?',
    );
  }

  let notesText = '';
  if (noteReferences.length > 0) {
    const notes: Record<NoteType, Map<string, string>> = {
      footnote: new Map(),
      endnote: new Map(),
    };
    for (const type of ['footnote', 'endnote'] as const) {
      const notesPath = relatedPart(`${type}s`);
      const notesFile = zip.file(notesPath);
      if (notesFile) {
        const reader = new PartReader(
          options,
          [],
          true,
          (await readRelationships(zip, notesPath)).byId,
          lists,
        );
        await streamXml(notesFile.nodeStream('nodebuffer'), reader);
        notes[type] = reader.notes;
      }
    }
    // Each referenced note, in reference order, as a list item whose last paragraph ends with the back-link. A
    // reference inside a note continues the numbering, as notes are written in that order (the note it points to is
    // not written).
    let noteNumber = noteReferences.length;
    notesText = noteReferences
      .map(({ type, id }) => {
        const note = (notes[type].get(id) ?? '').replaceAll(
          NOTE_REFERENCE,
          () => ` [${++noteNumber}] `,
        );
        return `${BLOCK}${note}  ↑ `;
      })
      .join('');
  }

  return normalizeLineBreaks(body.text + notesText).trim();
}

export default {
  inputKind: 'filePath' as const,
  types: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  extract: extractText,
};

import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Options } from '../../types.js';
import { normalizeLineBreaks } from '../html.js';
import { readLists, type Lists } from './lists.js';
import {
  findPartPath,
  readRelationships,
  RELATIONSHIP_TYPE,
  splitPath,
} from './package.js';
import { readDocument, readNotes } from './reader.js';
import { BLOCK, NOTE_REFERENCE, type NoteReference } from './state.js';
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
 * - index.ts: this extractor; opens the package, reads the body, then the notes;
 * - reader.ts: reads a streamed part, handing each element to its reader;
 * - paragraphs.ts: paragraphs, runs, text, hyperlinks, fields, note references and content controls;
 * - tables.ts: tables, rows and cells, and how the HTML extractor spaced them out;
 * - drawings.ts: text boxes and pictures;
 * - state.ts: what the readers share while reading a part;
 * - content.ts: how the text of an element's children is joined, links included;
 * - lists.ts: styles.xml and numbering.xml, and which paragraphs are list items;
 * - fields.ts: complex field instructions (hyperlinks, checkboxes);
 * - package.ts: relationships and part lookup;
 * - xml.ts: namespace resolution, line endings, and parsing a part whole or streamed.
 */

/**
 * Opens a DOCX file as a zip package.
 * @param filePath path to file
 * @returns the package
 */
async function openPackage(filePath: string): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(await readFile(filePath));
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
}

/**
 * The referenced footnotes and endnotes, in reference order, each as a list item whose last paragraph ends with the
 * back-link. A reference inside a note continues the numbering, as notes are written in that order (the note it
 * points to is not written).
 * @param zip the package
 * @param references the body's note references, in order
 * @param parts the footnotes and endnotes parts, where they exist
 * @param parts.footnote the footnotes part
 * @param parts.endnote the endnotes part
 * @param options extraction options
 * @param lists styles and numbering
 * @returns the notes' text
 */
async function notesText(
  zip: JSZip,
  references: NoteReference[],
  parts: Record<NoteReference['type'], JSZip.JSZipObject | null>,
  options: Options,
  lists: Lists,
): Promise<string> {
  if (references.length === 0) return '';
  const notes = {
    footnote: new Map<string, string>(),
    endnote: new Map<string, string>(),
  };
  for (const type of ['footnote', 'endnote'] as const) {
    const part = parts[type];
    if (!part) continue;
    const relationships = await readRelationships(zip, part.name);
    notes[type] = await streamXml(
      part.nodeStream('nodebuffer'),
      readNotes(options, relationships.byId, lists),
    );
  }
  let noteNumber = references.length;
  return references
    .map(({ type, id }) => {
      const note = (notes[type].get(id) ?? '').replaceAll(
        NOTE_REFERENCE,
        () => ` [${++noteNumber}] `,
      );
      return `${BLOCK}${note}  ↑ `;
    })
    .join('');
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
  const zip = await openPackage(filePath);
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

  const relationships = await readRelationships(zip, documentPath);
  // A part the document relates to, as mammoth finds it: by relationship, else at word/<name>.xml
  const relatedPart = (name: string): JSZip.JSZipObject | null =>
    zip.file(
      findPartPath(
        zip,
        relationships,
        `${RELATIONSHIP_TYPE}${name}`,
        splitPath(documentPath).dirname,
        `word/${name}.xml`,
      ),
    );
  const lists = readLists(
    await relatedPart('styles')?.async('string'),
    await relatedPart('numbering')?.async('string'),
  );

  const noteReferences: NoteReference[] = [];
  const body = await streamXml(
    documentFile.nodeStream('nodebuffer'),
    readDocument(options, relationships.byId, lists, noteReferences),
  );
  if (!body.sawBody) {
    throw new Error(
      'Could not find the body element: are you sure this is a docx file?',
    );
  }
  const notes = await notesText(
    zip,
    noteReferences,
    {
      footnote: relatedPart('footnotes'),
      endnote: relatedPart('endnotes'),
    },
    options,
    lists,
  );
  return normalizeLineBreaks(body.text + notes).trim();
}

export default {
  inputKind: 'filePath' as const,
  types: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  extract: extractText,
};

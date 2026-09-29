/* eslint-disable @typescript-eslint/no-use-before-define, jsdoc/require-yields -- readers call each other
 * recursively, as the elements nest (function declarations are hoisted), and every one yields only to take the next
 * XML event (see Reader in xml.ts) */
import type { Options } from '../../types.js';
import { Content, type Piece } from './content.js';
import {
  readAlternateContent,
  readDrawing,
  readTextBoxes,
} from './drawings.js';
import type { Lists } from './lists.js';
import {
  fieldChar,
  noteReference,
  readContentControl,
  readHyperlink,
  readParagraph,
  readParagraphProperties,
  readRun,
  readText,
  symbol,
} from './paragraphs.js';
import {
  BLOCK,
  type NoteReference,
  type OpenEvent,
  type State,
} from './state.js';
import {
  bookmark,
  readCell,
  readRow,
  readRowProperties,
  readTable,
} from './tables.js';
import { constant, skip, textContent, type Reader } from './xml.js';

/*
 * Reads one WordprocessingML part (the document, or the footnotes or endnotes) into text, one function per element,
 * the way mammoth's body reader and HTML writer treat it. Each function is called after its element's open event and
 * reads up to its close event; see Reader in xml.ts. Elements no function reads are skipped with their content.
 */

/** A VML image's title (o:title); mammoth never mapped this namespace, so it wrote "undefined" as the alt text. */
const VML_TITLE = '{urn:schemas-microsoft-com:office:office}title';

/** Elements whose children are read as they are (mammoth's readChildElements). */
const CONTAINERS = new Set([
  'w:document',
  'w:body',
  'w:ins',
  'w:object',
  'w:smartTag',
  'w:drawing',
  'v:roundrect',
  'v:shape',
  'v:textbox',
  'w:txbxContent',
  'v:group',
  'v:rect',
  'mc:Fallback',
  'w:sdtContent',
]);

/**
 * Reads a part, up to the close event that ends it.
 * @param options extraction options
 * @param relationships the part's relationship targets by id
 * @param lists styles and numbering
 * @param noteReferences where the body's note references are collected
 * @returns the part's text, and whether it had a w:body
 */
export function* readDocument(
  options: Options,
  relationships: Map<string, string>,
  lists: Lists,
  noteReferences: NoteReference[],
): Reader<{ text: string; sawBody: boolean }> {
  const state = newState(options, relationships, lists, noteReferences, false);
  const body = yield* children('#root', state);
  return { text: body, sawBody: state.sawBody };
}

/**
 * Reads a footnotes or endnotes part, up to the close event that ends it.
 * @param options extraction options
 * @param relationships the part's relationship targets by id
 * @param lists styles and numbering
 * @returns each note's text by id; a reference inside a note is NOTE_REFERENCE
 */
export function* readNotes(
  options: Options,
  relationships: Map<string, string>,
  lists: Lists,
): Reader<Map<string, string>> {
  const state = newState(options, relationships, lists, [], true);
  const notes = new Map<string, string>();
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (event.name !== 'w:footnotes' && event.name !== 'w:endnotes') {
      yield* skip();
      continue;
    }
    for (let note = yield; note.type !== 'close'; note = yield) {
      if (note.type !== 'open') continue;
      const type = note.attributes['w:type'];
      const isNote =
        (note.name === 'w:footnote' || note.name === 'w:endnote') &&
        type !== 'separator' &&
        type !== 'continuationSeparator';
      if (!isNote) {
        yield* skip();
        continue;
      }
      // Each note is a list item of its own, so a list does not continue from one note into the next, and a deleted
      // paragraph mark at the end of a note joins nothing
      state.containers[0].listPath = undefined;
      state.pendingDeleted = undefined;
      const content = yield* children(note.name, state);
      if (note.attributes['w:id'] !== undefined)
        notes.set(note.attributes['w:id'], content);
    }
  }
  return notes;
}

/**
 * Reading state for a part, with the body as the only open block container.
 * @param options extraction options
 * @param relationships the part's relationship targets by id
 * @param lists styles and numbering
 * @param noteReferences where note references are collected
 * @param notesPart whether the part is footnotes or endnotes
 * @returns the state
 */
function newState(
  options: Options,
  relationships: Map<string, string>,
  lists: Lists,
  noteReferences: NoteReference[],
  notesPart: boolean,
): State {
  const state: State = {
    options,
    relationships,
    lists,
    noteReferences,
    notesPart,
    paragraphs: [],
    containers: [{}],
    controls: [],
    tables: [],
    rows: [],
    fields: [],
    instruction: '',
    sawBody: false,
    readChildren: (parent) => children(parent, state),
    readElement: (event, parent) => element(event, parent, state),
  };
  return state;
}

/**
 * Reads the children of the current element as document content.
 * @param parent the current element's name
 * @param state reading state
 * @returns their text
 */
function* children(parent: string, state: State): Reader<string> {
  const content = new Content();
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type === 'open')
      content.add(yield* element(event, parent, state));
  }
  return content.toString();
}

/**
 * Reads one element of document content.
 * @param event its open event
 * @param parent its parent's name; only a bookmark's text depends on it (see bookmark in tables.ts)
 * @param state reading state
 * @returns its text, or a link
 */
function* element(
  event: OpenEvent,
  parent: string,
  state: State,
): Reader<Piece> {
  const { name, attributes } = event;
  switch (name) {
    case 'w:p':
      return yield* readParagraph(state);
    case 'w:pPr':
      return yield* readParagraphProperties(state);
    case 'w:r':
      return yield* readRun(state);
    case 'w:t':
      return yield* readText(state);
    case 'w:tab':
      return yield* constant('\t');
    case 'w:noBreakHyphen':
      return yield* constant('‑');
    case 'w:softHyphen':
      return yield* constant('­');
    case 'w:sym':
      return yield* constant(symbol(attributes));
    case 'w:br': {
      // A line break is <br />, which the HTML extractor marks on both sides; page and column breaks write nothing
      const type = attributes['w:type'];
      return yield* constant(
        type == null || type === 'textWrapping' ? BLOCK + BLOCK : '',
      );
    }
    case 'w:hyperlink':
      return yield* readHyperlink(attributes, state);
    case 'w:fldChar':
      fieldChar(attributes['w:fldCharType'], state);
      return yield* constant('');
    case 'w:instrText': {
      // A field instruction is not document text; it is kept only to recognise hyperlink and checkbox fields
      const instruction = yield* textContent();
      state.instruction += instruction;
      return '';
    }
    case 'w:footnoteReference':
    case 'w:endnoteReference':
      return yield* constant(noteReference(name, attributes, state));
    case 'w:bookmarkStart':
      return yield* constant(bookmark(attributes, parent, state));
    case 'w:tbl':
      return yield* readTable(state);
    case 'w:tr':
      return yield* readRow(state);
    case 'w:trPr':
      return yield* readRowProperties(state);
    case 'w:tc':
      return yield* readCell(state);
    case 'w:sdt':
      return yield* readContentControl(state);
    case 'w:pict':
      return yield* readTextBoxes(state);
    case 'wp:inline':
    case 'wp:anchor':
      return yield* readDrawing(state);
    case 'v:imagedata': {
      const title = attributes[VML_TITLE];
      const alt = state.options.includeAltText && attributes['r:id'] && title;
      return yield* constant(alt ? ` ${title} ` : '');
    }
    case 'mc:AlternateContent':
      return yield* readAlternateContent(state);
    case 'w:body':
      state.sawBody = true;
      return yield* children(name, state);
    default:
      if (CONTAINERS.has(name)) return yield* children(name, state);
      // Unknown and ignored elements are skipped with everything inside them, as in mammoth
      yield* skip();
      return '';
  }
}

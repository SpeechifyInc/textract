/* eslint-disable max-classes-per-file -- the namespace resolver and the part reader share this file's constants */
import { readFile } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import * as dingbatToUnicode from 'dingbat-to-unicode';
import { Parser } from 'htmlparser2';
import JSZip from 'jszip';
import type { Options } from '../types.js';
import { normalizeLineBreaks } from './html.js';

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
 */

const BLOCK = '|||||';

/** Relationship types are matched exactly, Transitional only, as mammoth does; other parts use the fallback path */
const RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

/** Stands for a note reference inside a note until the notes are numbered; XML text cannot contain U+0000 */
const NOTE_REFERENCE = '\u0000';

/** Where mammoth looks for a picture in a DrawingML drawing, each a direct child of the one before */
const PICTURE_PATH = ['a:graphic', 'a:graphicData', 'pic:pic', 'pic:blipFill'];

/**
 * Namespaces mammoth reads, by the prefix it reads them under (its office-xml-reader map). Element and attribute
 * names are resolved through the document's own xmlns declarations to these prefixes, so a file that declares other
 * prefixes, or Strict OOXML, reads the same; a name in any other namespace matches nothing, as in mammoth.
 */
const NAMESPACES: Record<string, string> = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing':
    'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
  'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',
  'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
  'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing': 'wp',
  'http://purl.oclc.org/ooxml/drawingml/main': 'a',
  'http://purl.oclc.org/ooxml/drawingml/picture': 'pic',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
  'urn:schemas-microsoft-com:vml': 'v',
  'urn:schemas-microsoft-com:office:word': 'office-word',
  'http://schemas.microsoft.com/office/word/2010/wordml': 'wordml',
  'http://schemas.openxmlformats.org/package/2006/relationships':
    'relationships',
};

/** A VML image's title (o:title); mammoth never mapped this namespace, so it wrote "undefined" as the alt text. */
const VML_TITLE = '{urn:schemas-microsoft-com:office:office}title';

/**
 * Resolves qualified names against the xmlns declarations in scope.
 */
class NameResolver {
  private readonly scopes: Map<string, string>[] = [new Map<string, string>()];

  open(
    qname: string,
    attributes: Record<string, string>,
  ): { name: string; attributes: Record<string, string> } {
    let scope = this.scopes[this.scopes.length - 1];
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) {
        if (scope === this.scopes[this.scopes.length - 1])
          scope = new Map(scope);
        scope.set(key === 'xmlns' ? '' : key.slice('xmlns:'.length), value);
      }
    }
    this.scopes.push(scope);

    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== 'xmlns' && !key.startsWith('xmlns:'))
        resolved[this.resolve(key, scope, false)] = value;
    }
    return { name: this.resolve(qname, scope, true), attributes: resolved };
  }

  close(): void {
    this.scopes.pop();
  }

  private resolve(
    qname: string,
    scope: Map<string, string>,
    isElement: boolean,
  ): string {
    const colon = qname.indexOf(':');
    // An unprefixed attribute has no namespace; an unprefixed element takes the default one
    if (colon === -1 && !isElement) return qname;
    const prefix = colon === -1 ? '' : qname.slice(0, colon);
    const local = colon === -1 ? qname : qname.slice(colon + 1);
    const uri = scope.get(prefix);
    if (uri === undefined) return qname;
    const known = NAMESPACES[uri];
    return known ? `${known}:${local}` : `{${uri}}${local}`;
  }
}

/**
 * Line endings as xmldom (mammoth's XML parser) normalizes them before parsing, following XML 1.1: CR LF, CR NEL,
 * CR, NEL and LINE SEPARATOR all become LF. An entity such as `&#x2028;` is not raw text and stays as it is.
 * @param text raw XML
 * @returns XML with normalized line endings
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r[\n\u0085]/g, '\n').replace(/[\r\u0085\u2028]/g, '\n');
}

/** Elements whose children are read as they are (mammoth's readChildElements). */
const CONTAINERS = new Set([
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

type NoteType = 'footnote' | 'endnote';

interface Frame {
  kind:
    | 'root'
    | 'p'
    | 'pPr'
    | 'pPrRPr'
    | 'tr'
    | 'trPr'
    | 'tc'
    | 'hyperlink'
    | 'pict'
    | 'drawing'
    | 'drawingInner'
    | 'sdt'
    | 'sdtPr'
    | 'alternate'
    | 'container'
    | 'tbl'
    | 'runProps'
    | 'numPr'
    | 'tcPr'
    | 'text'
    | 'instruction';
  parts: string[];
  deleted?: boolean;
  /** Text boxes held by a paragraph, written after it */
  extras: string[];
  checkbox?: boolean;
  checkboxDone?: boolean;
  /** A drawing's wp:docPr alt text, and how many pictures it holds */
  alt?: string;
  docPr?: boolean;
  images?: number;
  /** A drawing's descendant element, to match the picture path */
  name?: string;
  header?: boolean;
  /** A paragraph holding an image or a checkbox is written even without text */
  written?: boolean;
  /** A hyperlink's target, which decides whether it merges with the link written just before it */
  link?: string;
  /** The target of the link this frame's parts end with, if they do */
  lastLink?: string;
  /** Text the HTML parser moves in front of a table: what mammoth writes inside <table> but outside a cell */
  fostered?: string;
  /** A run inside a hyperlink field: its link sits inside the run's formatting elements */
  fieldRun?: boolean;
  /** The formatting elements mammoth wraps a run in (strong, em, s, sup, sub) */
  format?: string;
  /** A paragraph's style and numbering (pPr/pStyle, pPr/numPr) */
  styleId?: string;
  numId?: string;
  ilvl?: string;
  /** A block container's open list, as tags per level, when the block written last in it was a list item */
  listPath?: ListTag[];
  /** A row's cells, or a table's rows, kept until the table closes; a string is a bookmark's space between them */
  cells?: (TableCell | string)[];
  rows?: (TableRow | string)[];
  /** A cell's w:gridSpan and w:vMerge */
  colSpan?: number;
  vMerge?: boolean;
}

interface TableCell {
  content: string;
  colSpan: number;
  vMerge: boolean;
  removed?: boolean;
}

interface TableRow {
  header: boolean;
  cells: (TableCell | string)[];
}

/** A complex field (fldChar begin/separate/end), as mammoth tracks it */
interface Field {
  type: 'begin' | 'hyperlink' | 'checkbox' | 'unknown';
  /** A hyperlink field's target */
  link?: string;
}

interface NoteReference {
  type: NoteType;
  id: string;
}

type ListTag = 'ul' | 'ol';

interface ListLevel {
  isOrdered: boolean;
  level: string;
}

/**
 * What mammoth reads from styles.xml and numbering.xml to turn numbered paragraphs into nested <ul>/<ol> lists.
 * Plain objects on purpose: mammoth indexes levels by paragraph style over its objects' key order.
 */
interface Lists {
  paragraphStyleNames: Record<string, string | null>;
  numberingStyleNumIds: Record<string, string | undefined>;
  nums: Record<string, string | undefined>;
  abstractNums: Record<
    string,
    { levels: Record<string, ListLevel>; numStyleLink?: string }
  >;
  levelsByParagraphStyle: Record<string, ListLevel>;
}

/** Paragraph styles mammoth's default style map maps before its list rules: such a paragraph is never a list item */
const HEADING_STYLE_IDS = new Set([
  'Heading1',
  'Heading2',
  'Heading3',
  'Heading4',
  'Heading5',
  'Heading6',
  'Heading',
]);
const NON_LIST_STYLE_NAMES = new Set([
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`Heading ${n}`, `heading ${n}`]),
  'Heading',
  'footnote text',
  'endnote text',
  'annotation text',
  'Footnote',
  'Endnote',
]);

/**
 * mammoth's numbering.findLevel, following a numbering-style link at most a few times.
 * @param lists styles and numbering
 * @param numId w:numId
 * @param level w:ilvl
 * @returns the list level, or null
 */
function findListLevel(
  lists: Lists,
  numId: string,
  level: string,
): ListLevel | null {
  let id: string | undefined = numId;
  for (let hops = 0; hops < 10 && id !== undefined; hops++) {
    const abstractNumId: string | undefined = lists.nums[id];
    const abstractNum: Lists['abstractNums'][string] | undefined =
      abstractNumId === undefined
        ? undefined
        : lists.abstractNums[abstractNumId];
    if (!abstractNum) return null;
    if (abstractNum.numStyleLink === undefined)
      return abstractNum.levels[level] ?? null;
    id = lists.numberingStyleNumIds[abstractNum.numStyleLink];
  }
  return null;
}

/**
 * Parses a whole XML part, calling back with each element's resolved name and its ancestors' names.
 * @param xml the part
 * @param open called at each start tag
 * @param close called at each end tag
 */
function walkXml(
  xml: string,
  open: (
    name: string,
    attributes: Record<string, string>,
    ancestors: string[],
  ) => void,
  close: (name: string) => void = () => undefined,
): void {
  const names = new NameResolver();
  const ancestors: string[] = [];
  const parser = new Parser(
    {
      onopentag: (qname, qattributes) => {
        const { name, attributes } = names.open(qname, qattributes);
        open(name, attributes, ancestors);
        ancestors.push(name);
      },
      onclosetag: () => {
        names.close();
        close(ancestors.pop() ?? '');
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  parser.write(normalizeLineEndings(xml));
  parser.end();
}

/**
 * Reads styles.xml and numbering.xml, as far as mammoth uses them for lists.
 * @param stylesXml styles part, if any
 * @param numberingXml numbering part, if any
 * @returns the list model
 */
function readLists(
  stylesXml: string | undefined,
  numberingXml: string | undefined,
): Lists {
  const lists: Lists = {
    paragraphStyleNames: {},
    numberingStyleNumIds: {},
    nums: {},
    abstractNums: {},
    levelsByParagraphStyle: {},
  };
  const parent = (ancestors: string[], ...names: string[]): boolean =>
    names.every(
      (name, i) => ancestors[ancestors.length - names.length + i] === name,
    );

  if (stylesXml) {
    let style:
      | {
          type?: string;
          styleId?: string;
          name?: string | null;
          numId?: string;
          seenName?: boolean;
          seenNumId?: boolean;
        }
      | undefined;
    walkXml(
      stylesXml,
      (name, attributes, ancestors) => {
        if (name === 'w:style')
          style = {
            type: attributes['w:type'],
            styleId: attributes['w:styleId'],
            name: null,
          };
        else if (
          style &&
          name === 'w:name' &&
          parent(ancestors, 'w:style') &&
          !style.seenName
        ) {
          style.seenName = true;
          style.name = attributes['w:val'] ?? null;
        } else if (
          style &&
          name === 'w:numId' &&
          parent(ancestors, 'w:style', 'w:pPr', 'w:numPr') &&
          !style.seenNumId
        ) {
          style.seenNumId = true;
          style.numId = attributes['w:val'];
        }
      },
      (name) => {
        if (name !== 'w:style' || !style?.styleId) return;
        // The first definition of a style id wins
        if (
          style.type === 'paragraph' &&
          !(style.styleId in lists.paragraphStyleNames)
        ) {
          lists.paragraphStyleNames[style.styleId] = style.name ?? null;
        } else if (
          style.type === 'numbering' &&
          !(style.styleId in lists.numberingStyleNumIds)
        ) {
          lists.numberingStyleNumIds[style.styleId] = style.numId;
        }
        style = undefined;
      },
    );
  }

  if (numberingXml) {
    let abstract:
      | {
          id?: string;
          levels: Record<string, ListLevel & { paragraphStyleId?: string }>;
          withoutIndex?: ListLevel & { paragraphStyleId?: string };
          numStyleLink?: string;
        }
      | undefined;
    let level: { ilvl?: string; numFmt?: string; pStyle?: string } | undefined;
    let num: { numId?: string; abstractNumId?: string } | undefined;
    walkXml(
      numberingXml,
      (name, attributes, ancestors) => {
        if (name === 'w:abstractNum')
          abstract = { id: attributes['w:abstractNumId'], levels: {} };
        else if (abstract && name === 'w:lvl')
          level = { ilvl: attributes['w:ilvl'] };
        else if (
          level &&
          name === 'w:numFmt' &&
          parent(ancestors, 'w:lvl') &&
          level.numFmt === undefined
        )
          level.numFmt = attributes['w:val'] ?? '';
        else if (
          level &&
          name === 'w:pStyle' &&
          parent(ancestors, 'w:lvl') &&
          level.pStyle === undefined
        )
          level.pStyle = attributes['w:val'];
        else if (
          abstract &&
          name === 'w:numStyleLink' &&
          parent(ancestors, 'w:abstractNum') &&
          abstract.numStyleLink === undefined
        )
          abstract.numStyleLink = attributes['w:val'];
        else if (name === 'w:num') num = { numId: attributes['w:numId'] };
        else if (
          num &&
          name === 'w:abstractNumId' &&
          parent(ancestors, 'w:num') &&
          num.abstractNumId === undefined
        )
          num.abstractNumId = attributes['w:val'];
      },
      (name) => {
        if (name === 'w:lvl' && abstract && level) {
          const read = {
            isOrdered: level.numFmt !== 'bullet',
            level: level.ilvl ?? '0',
            paragraphStyleId: level.pStyle,
          };
          if (level.ilvl === undefined) abstract.withoutIndex = read;
          else abstract.levels[level.ilvl] = read;
          level = undefined;
        } else if (name === 'w:abstractNum' && abstract) {
          if (
            abstract.withoutIndex &&
            abstract.levels[abstract.withoutIndex.level] === undefined
          ) {
            abstract.levels[abstract.withoutIndex.level] =
              abstract.withoutIndex;
          }
          if (abstract.id !== undefined)
            lists.abstractNums[abstract.id] = {
              levels: abstract.levels,
              numStyleLink: abstract.numStyleLink,
            };
          abstract = undefined;
        } else if (name === 'w:num' && num) {
          if (num.numId !== undefined)
            lists.nums[num.numId] = num.abstractNumId;
          num = undefined;
        }
      },
    );
    // mammoth indexes every level by its paragraph style over its objects' key order; the last one wins
    for (const abstractNum of Object.values(lists.abstractNums)) {
      for (const listLevel of Object.values(
        abstractNum.levels,
      ) as (ListLevel & {
        paragraphStyleId?: string;
      })[]) {
        if (listLevel.paragraphStyleId != null)
          lists.levelsByParagraphStyle[listLevel.paragraphStyleId] = listLevel;
      }
    }
  }
  return lists;
}

/**
 * A table as mammoth writes it and the HTML extractor reads it back:
 * - a vertically merged continuation cell is dropped when an earlier row has a cell at its column, unless the table
 *   holds something besides rows and cells, in which case mammoth merges nothing (calculateRowSpans);
 * - the rows before the first non-header one are <th> cells, which the HTML extractor leaves alone; every other cell
 *   is a <td>, which it spaces out.
 * @param rows the table's rows, and bookmark spaces between them
 * @returns text
 */
function renderTable(rows: (TableRow | string)[]): string {
  const onlyCells = rows.every(
    (row) =>
      typeof row !== 'string' &&
      row.cells.every((cell) => typeof cell !== 'string'),
  );
  if (onlyCells) {
    const columns = new Set<number>();
    for (const row of rows as TableRow[]) {
      let index = 0;
      for (const cell of row.cells as TableCell[]) {
        if (cell.vMerge && columns.has(index)) cell.removed = true;
        else columns.add(index);
        index += cell.colSpan;
      }
    }
  }
  let bodyIndex = rows.findIndex(
    (row) => typeof row === 'string' || !row.header,
  );
  if (bodyIndex === -1) bodyIndex = rows.length;
  return rows
    .map((row, rowIndex) => {
      if (typeof row === 'string') return row;
      return row.cells
        .map((cell) => {
          if (typeof cell === 'string') return cell;
          if (cell.removed) return '';
          return rowIndex < bodyIndex ? cell.content : ` ${cell.content} `;
        })
        .join('');
    })
    .join('');
}

/**
 * Streams one WordprocessingML part (document, footnotes or endnotes) into text with block markers.
 */
class PartReader {
  private readonly frames: Frame[] = [{ kind: 'root', parts: [], extras: [] }];
  private skipDepth = 0;
  private readonly fields: Field[] = [];
  /** Instruction text of the field begun last (mammoth keeps one buffer, reset by every begin) */
  private instruction = '';
  /** A paragraph whose mark is deleted, waiting to be joined to the next paragraph */
  private pendingDeleted:
    | { parts: string[]; extras: string[]; written: boolean }
    | undefined;
  /** Whether the part had a w:body */
  sawBody = false;
  /** Footnote/endnote bodies by id, when reading a notes part. */
  readonly notes = new Map<string, string>();
  private noteId: string | undefined;

  constructor(
    private readonly options: Options,
    private readonly noteReferences: NoteReference[],
    private readonly notesPart: boolean,
    /** The part's relationship targets by id, to tell hyperlink targets apart */
    private readonly relationships: Map<string, string>,
    private readonly lists: Lists,
  ) {}

  get text(): string {
    return this.frames[0].parts.join('');
  }

  private get top(): Frame {
    return this.frames[this.frames.length - 1];
  }

  private push(kind: Frame['kind']): Frame {
    const frame: Frame = { kind, parts: [], extras: [] };
    this.frames.push(frame);
    return frame;
  }

  private emit(text: string): void {
    // Nothing written is nothing in mammoth's HTML either, so links on both sides of it still merge
    if (text.length === 0) return;
    this.top.parts.push(text);
    this.top.lastLink = undefined;
  }

  /**
   * The element mammoth's HTML nests this block in (the body, a cell or a text box); other wrappers are flattened.
   * @returns the innermost block container frame
   */
  private blockContext(): Frame {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const { kind } = this.frames[i];
      if (kind === 'root' || kind === 'tc' || kind === 'pict')
        return this.frames[i];
    }
    return this.frames[0];
  }

  /**
   * How many block markers a written paragraph opens: one for a <p> or heading; for a list item, one per <li> it
   * opens. A list item's path is ul|ol > li per level above it, then ul or ol > li:fresh; mammoth's HTML writer
   * merges each non-fresh element into the matching one the previous block left open.
   * @param frame the paragraph
   * @returns marker count
   */
  private openBlock(frame: Frame): number {
    const context = this.blockContext();
    const list = this.listLevel(frame);
    if (!list) {
      context.listPath = undefined;
      return 1;
    }
    const previous = context.listPath ?? [];
    const listPath: ListTag[] = [];
    let reused = 0;
    let merging = true;
    for (let i = 0; i < list.depth; i++) {
      const last = i === list.depth - 1;
      const wanted: ListTag | undefined = last ? list.tag : undefined; // above the item's own level, ul|ol
      if (
        merging &&
        i < previous.length &&
        (wanted === undefined || previous[i] === wanted)
      ) {
        listPath.push(previous[i]);
        // the <li> above this level is reused too, unless this is the item's own (fresh) <li>
        if (!last) reused++;
      } else {
        merging = false;
        listPath.push(wanted ?? 'ul');
      }
    }
    context.listPath = listPath;
    return list.depth - reused;
  }

  /**
   * The list level mammoth maps a paragraph to, if its default style map makes it a list item at all.
   * @param frame the paragraph
   * @returns its depth (1-5) and list tag, or undefined for a plain paragraph
   */
  private listLevel(frame: Frame): { depth: number; tag: ListTag } | undefined {
    const { styleId } = frame;
    if (styleId !== undefined) {
      const name = this.lists.paragraphStyleNames[styleId] ?? null;
      if (
        HEADING_STYLE_IDS.has(styleId) ||
        (name !== null && NON_LIST_STYLE_NAMES.has(name))
      )
        return undefined;
    }
    let level: ListLevel | null = null;
    if (frame.ilvl !== undefined && frame.numId !== undefined)
      level = findListLevel(this.lists, frame.numId, frame.ilvl);
    else if (
      styleId !== undefined &&
      this.lists.levelsByParagraphStyle[styleId]
    )
      level = this.lists.levelsByParagraphStyle[styleId];
    else if (frame.numId !== undefined)
      level = findListLevel(this.lists, frame.numId, '0');
    if (!level) return undefined;
    // The default style map has list rules for levels 1-5; a deeper level is a plain paragraph
    const index = Number(level.level);
    if (!Number.isInteger(index) || index < 0 || index > 4) return undefined;
    return { depth: index + 1, tag: level.isOrdered ? 'ol' : 'ul' };
  }

  private closest(kind: Frame['kind']): Frame | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].kind === kind) return this.frames[i];
    }
    return undefined;
  }

  onOpen(name: string, attributes: Record<string, string>): void {
    if (this.skipDepth > 0) {
      this.skipDepth++;
      return;
    }
    const { top } = this;

    // Property elements are read only for what changes the text: a field run's formatting, a paragraph's style,
    // numbering and deletion mark, a row's deletion and header marks, a cell's spans and a content control's checkbox
    if (top.kind === 'runProps') {
      const on = !['false', '0', 'off'].includes(attributes['w:val'] ?? '');
      const run = this.closest('hyperlink');
      if (run && on && ['w:b', 'w:i', 'w:strike'].includes(name))
        run.format = (run.format ?? '') + name;
      if (
        run &&
        name === 'w:vertAlign' &&
        ['superscript', 'subscript'].includes(attributes['w:val'] ?? '')
      ) {
        run.format = (run.format ?? '') + (attributes['w:val'] ?? '');
      }
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'pPr') {
      const paragraph = this.closest('p');
      if (name === 'w:rPr') {
        this.push('pPrRPr');
        return;
      }
      if (
        name === 'w:numPr' &&
        paragraph &&
        paragraph.numId === undefined &&
        paragraph.ilvl === undefined
      ) {
        this.push('numPr');
        return;
      }
      if (name === 'w:pStyle' && paragraph && paragraph.styleId === undefined)
        paragraph.styleId = attributes['w:val'];
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'numPr') {
      const paragraph = this.closest('p');
      if (paragraph && name === 'w:ilvl' && paragraph.ilvl === undefined)
        paragraph.ilvl = attributes['w:val'];
      if (paragraph && name === 'w:numId' && paragraph.numId === undefined)
        paragraph.numId = attributes['w:val'];
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'pPrRPr') {
      const paragraph = this.closest('p');
      if (paragraph && name === 'w:del') paragraph.deleted = true;
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'trPr') {
      const row = this.closest('tr');
      if (row && name === 'w:del') row.deleted = true;
      // mammoth takes any w:tblHeader as a header row, whatever its w:val
      if (row && name === 'w:tblHeader') row.header = true;
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'tcPr') {
      const cell = this.closest('tc');
      if (cell && name === 'w:gridSpan' && cell.colSpan === undefined) {
        const gridSpan = attributes['w:val'];
        cell.colSpan = gridSpan ? parseInt(gridSpan, 10) : 1;
      }
      if (cell && name === 'w:vMerge' && cell.vMerge === undefined) {
        const val = attributes['w:val'];
        cell.vMerge = val === 'continue' || !val;
      }
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'sdtPr') {
      const sdt = this.closest('sdt');
      if (sdt && name === 'wordml:checkbox') sdt.checkbox = true;
      this.skipDepth = 1;
      return;
    }
    if (top.kind === 'alternate') {
      if (name === 'mc:Fallback') this.push('container');
      else this.skipDepth = 1;
      return;
    }
    if (top.kind === 'drawing' || top.kind === 'drawingInner') {
      // Pictures only: text boxes drawn with DrawingML are not read, as in mammoth
      const drawing = this.closest('drawing') ?? top;
      if (name === 'wp:docPr' && top === drawing && !drawing.docPr) {
        drawing.docPr = true;
        drawing.alt = attributes.descr?.trim()
          ? attributes.descr
          : attributes.title;
        this.skipDepth = 1;
      } else if (name === 'a:blip') {
        const depth = this.frames.length;
        if (
          (attributes['r:embed'] || attributes['r:link']) &&
          this.frames[depth - PICTURE_PATH.length - 1] === drawing &&
          PICTURE_PATH.every(
            (step, i) =>
              this.frames[depth - PICTURE_PATH.length + i].name === step,
          )
        )
          drawing.images = (drawing.images ?? 0) + 1;
        this.skipDepth = 1;
      } else {
        this.push('drawingInner').name = name;
      }
      return;
    }

    switch (name) {
      case 'w:document':
        this.push('container');
        return;
      case 'w:footnotes':
      case 'w:endnotes':
        if (this.notesPart) {
          this.push('container');
          return;
        }
        break;
      case 'w:footnote':
      case 'w:endnote': {
        const type = attributes['w:type'];
        if (
          this.notesPart &&
          type !== 'separator' &&
          type !== 'continuationSeparator'
        ) {
          this.noteId = attributes['w:id'];
          this.frames[0].listPath = undefined;
          this.push('container');
          return;
        }
        break;
      }
      case 'w:p':
        this.push('p');
        return;
      case 'w:pPr':
        this.push('pPr');
        return;
      case 'w:tr':
        this.push('tr');
        return;
      case 'w:trPr':
        this.push('trPr');
        return;
      case 'w:tc':
        this.push('tc');
        return;
      case 'w:tcPr':
        if (top.kind === 'tc') {
          this.push('tcPr');
          return;
        }
        break;
      case 'w:hyperlink': {
        // Without a target mammoth reads the children as plain content, not as a link
        const relationshipId = attributes['r:id'];
        const anchor = attributes['w:anchor'];
        if (!relationshipId && !anchor) {
          this.push('container');
          return;
        }
        const href = relationshipId
          ? (this.relationships.get(relationshipId) ?? '')
          : undefined;
        const target =
          href === undefined
            ? `anchor:${anchor}`
            : `href:${anchor ? `${href.split('#')[0]}#${anchor}` : href}`;
        this.push('hyperlink').link =
          `${target} ${attributes['w:tgtFrame'] ?? ''}`;
        return;
      }
      case 'w:pict':
        this.push('pict');
        return;
      case 'wp:inline':
      case 'wp:anchor':
        this.push('drawing');
        return;
      case 'mc:AlternateContent':
        this.push('alternate');
        return;
      case 'w:sdt':
        this.push('sdt');
        return;
      case 'w:sdtPr':
        if (top.kind === 'sdt') {
          this.push('sdtPr');
          return;
        }
        break;
      case 'w:t':
        this.push('text');
        return;
      case 'w:tab':
        this.emit('\t');
        this.skipDepth = 1;
        return;
      case 'w:noBreakHyphen':
        this.emit('‑');
        this.skipDepth = 1;
        return;
      case 'w:softHyphen':
        this.emit('­');
        this.skipDepth = 1;
        return;
      case 'w:sym': {
        const font = attributes['w:font'];
        const char = attributes['w:char'];
        const symbol =
          dingbatToUnicode.hex(font, char) ??
          (/^F0..$/.test(char ?? '')
            ? dingbatToUnicode.hex(font, char.substring(2))
            : undefined);
        if (symbol) this.emit(symbol.string);
        this.skipDepth = 1;
        return;
      }
      case 'w:br': {
        // A line break is <br />, which the HTML extractor marks on both sides; page and column breaks write nothing
        const type = attributes['w:type'];
        if (type == null || type === 'textWrapping') this.emit(BLOCK + BLOCK);
        this.skipDepth = 1;
        return;
      }
      case 'w:bookmarkStart': {
        // Written as an empty <a id>, which the HTML extractor spaces out (' <a id> </a>'). Between rows or cells the
        // HTML parser moves the <a> in front of the table, with the space inside it; the space before it stays put.
        if (attributes['w:name'] !== '_GoBack') {
          const holder =
            top.kind === 'tbl' || top.kind === 'tr' ? top : undefined;
          const table = holder ? this.closest('tbl') : undefined;
          if (holder && table) {
            table.fostered = `${table.fostered ?? ''} `;
            if (holder.kind === 'tr') (holder.cells ??= []).push(' ');
            else (holder.rows ??= []).push(' ');
          } else {
            this.emit('  ');
          }
        }
        this.skipDepth = 1;
        return;
      }
      case 'w:tbl':
        this.push('tbl');
        return;
      case 'w:footnoteReference':
      case 'w:endnoteReference':
        // Inside a note a reference is numbered when the notes are written, in the order they are referenced
        if (this.notesPart) {
          this.emit(NOTE_REFERENCE);
          this.skipDepth = 1;
          return;
        }
        this.noteReferences.push({
          type: name === 'w:footnoteReference' ? 'footnote' : 'endnote',
          id: attributes['w:id'],
        });
        this.emit(` [${this.noteReferences.length}] `);
        this.skipDepth = 1;
        return;
      case 'w:fldChar':
        this.onFieldChar(attributes['w:fldCharType']);
        this.skipDepth = 1;
        return;
      case 'w:r': {
        // Inside a hyperlink field every run is its own link, wrapped in the run's formatting; see onClose
        const link = this.fields.findLast(
          (field) => field.type === 'hyperlink',
        )?.link;
        if (link === undefined) {
          this.push('container');
        } else {
          const run = this.push('hyperlink');
          run.link = link;
          run.fieldRun = true;
          run.format = '';
        }
        return;
      }
      case 'w:rPr':
        if (top.fieldRun) {
          this.push('runProps');
          return;
        }
        break;
      case 'w:instrText':
        this.push('instruction');
        return;
      case 'v:imagedata':
        if (
          this.options.includeAltText &&
          attributes['r:id'] &&
          attributes[VML_TITLE]
        ) {
          this.emit(` ${attributes[VML_TITLE]} `);
        }
        this.skipDepth = 1;
        return;
      default:
        if (name === 'w:body') this.sawBody = true;
        if (CONTAINERS.has(name)) {
          this.push('container');
          return;
        }
    }
    // Unknown and ignored elements are skipped with everything inside them, as in mammoth
    this.skipDepth = 1;
  }

  onText(text: string): void {
    if (
      this.skipDepth > 0 ||
      (this.top.kind !== 'text' && this.top.kind !== 'instruction')
    )
      return;
    this.top.parts.push(text);
  }

  onClose(): void {
    if (this.skipDepth > 0) {
      this.skipDepth--;
      return;
    }
    const frame = this.frames.pop();
    if (!frame) return;
    const content = frame.parts.join('');

    switch (frame.kind) {
      case 'instruction':
        // A field instruction is not document text; it is kept only to recognise hyperlink and checkbox fields
        this.instruction += content;
        return;
      case 'text': {
        // A checkbox content control shows its state as its first character, which mammoth replaces with an <input>;
        // an inner control claims a character before the ones around it
        const control =
          content.length > 0
            ? this.frames.findLast(
                (sdt) =>
                  sdt.kind === 'sdt' && sdt.checkbox && !sdt.checkboxDone,
              )
            : undefined;
        if (control) {
          control.checkboxDone = true;
          const paragraph = this.closest('p');
          if (paragraph) paragraph.written = true;
          return;
        }
        this.emit(content);
        return;
      }
      case 'p': {
        if (frame.deleted) {
          // A deleted paragraph mark joins this paragraph, text boxes and images included, to the next one
          this.pendingDeleted ??= { parts: [], extras: [], written: false };
          this.pendingDeleted.parts.push(content);
          this.pendingDeleted.extras.push(...frame.extras);
          this.pendingDeleted.written ||= frame.written ?? false;
          return;
        }
        const pending = this.pendingDeleted;
        this.pendingDeleted = undefined;
        const merged = (pending?.parts.join('') ?? '') + content;
        // An empty paragraph is not written (mammoth's ignoreEmptyParagraphs); one holding only an image is. Only an
        // opening block tag breaks the line in the HTML extractor (its closing-tag pattern needs a space after `</`),
        // so a paragraph gets one marker, and a list item one for each <li> it opens.
        const written = merged.length > 0 || pending?.written || frame.written;
        this.emit(
          (written ? BLOCK.repeat(this.openBlock(frame)) + merged : '') +
            (pending?.extras.join('') ?? '') +
            frame.extras.join(''),
        );
        return;
      }
      case 'tc': {
        const row = this.closest('tr');
        const cell = {
          content,
          colSpan: frame.colSpan ?? 1,
          vMerge: frame.vMerge ?? false,
        };
        if (row) (row.cells ??= []).push(cell);
        else this.emit(` ${content} `);
        return;
      }
      case 'tr': {
        // A deleted row is not read at all
        const table = this.closest('tbl');
        if (frame.deleted || !table) return;
        (table.rows ??= []).push({
          header: frame.header ?? false,
          cells: frame.cells ?? [],
        });
        return;
      }
      case 'tbl':
        this.blockContext().listPath = undefined;
        // Anything written in the table outside its rows (a malformed file) is moved in front of it, like `fostered`
        this.emit(
          (frame.fostered ?? '') + content + renderTable(frame.rows ?? []),
        );
        return;
      case 'hyperlink': {
        // An empty link writes nothing. Adjacent links to the same target are one <a> in mammoth's HTML, so the
        // HTML extractor spaces out the group, not each part.
        if (content.length === 0) return;
        const { parts } = this.top;
        const link = `${frame.link}|${frame.format ?? ''}`;
        if (this.top.lastLink === link && parts.at(-1) === ' ') {
          // Joined into the link before: its trailing space moves after this part (every run of a field is a link)
          parts[parts.length - 1] = content;
          parts.push(' ');
        } else {
          this.emit(' ');
          parts.push(content, ' ');
          this.top.lastLink = link;
        }
        return;
      }
      case 'pict': {
        // Text boxes are written after the paragraph that holds them
        const paragraph = this.closest('p');
        if (paragraph) paragraph.extras.push(content);
        else this.emit(content);
        return;
      }
      case 'drawing': {
        if (!frame.images) return;
        const paragraph = this.closest('p');
        if (paragraph) paragraph.written = true;
        if (this.options.includeAltText && frame.alt)
          this.emit(` ${frame.alt} `.repeat(frame.images));
        return;
      }
      case 'pPr':
      case 'tcPr':
      case 'numPr':
      case 'runProps':
      case 'pPrRPr':
      case 'trPr':
      case 'sdtPr':
      case 'drawingInner':
        return;
      default:
        if (
          this.notesPart &&
          this.noteId !== undefined &&
          this.frames.length === 2
        ) {
          this.notes.set(this.noteId, content);
          this.noteId = undefined;
          return;
        }
        this.emit(content);
    }
  }

  /**
   * mammoth's complex fields: the instruction is parsed at separate, or at end when there is no separate.
   * @param type the w:fldCharType (begin, separate or end)
   */
  private onFieldChar(type: string | undefined): void {
    if (type === 'begin') {
      this.fields.push({ type: 'begin' });
      this.instruction = '';
    } else if (type === 'separate') {
      if (this.fields.pop()) this.fields.push(this.parseInstruction());
    } else if (type === 'end') {
      const field = this.fields.pop();
      const ended = field?.type === 'begin' ? this.parseInstruction() : field;
      // A checkbox field is written as an <input>, so its paragraph is written
      if (ended?.type === 'checkbox') {
        const paragraph = this.closest('p');
        if (paragraph) paragraph.written = true;
      }
    }
  }

  private parseInstruction(): Field {
    const href = /\s*HYPERLINK "(.*)"/.exec(this.instruction);
    if (href) return { type: 'hyperlink', link: `href:${href[1]} ` };
    const anchor = /\s*HYPERLINK\s+\\l\s+"(.*)"/.exec(this.instruction);
    if (anchor) return { type: 'hyperlink', link: `anchor:${anchor[1]} ` };
    if (/\s*FORMCHECKBOX\s*/.test(this.instruction))
      return { type: 'checkbox' };
    return { type: 'unknown' };
  }
}

/**
 * Feeds an XML stream to a PartReader.
 * @param stream XML part as a byte stream
 * @param reader reader to feed
 */
async function readPart(
  stream: NodeJS.ReadableStream,
  reader: PartReader,
): Promise<void> {
  const names = new NameResolver();
  // mammoth's XML reader keeps elements and text nodes only, so CDATA sections are not read
  let cdata = false;
  const parser = new Parser(
    {
      onopentag: (qname, qattributes) => {
        const { name, attributes } = names.open(qname, qattributes);
        reader.onOpen(name, attributes);
      },
      ontext: (text) => {
        if (!cdata) reader.onText(text);
      },
      oncdatastart: () => {
        cdata = true;
      },
      oncdataend: () => {
        cdata = false;
      },
      onclosetag: () => {
        names.close();
        reader.onClose();
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  const decoder = new StringDecoder('utf8');
  // A CR at the end of a chunk may pair with a LF or NEL at the start of the next one
  let carry = '';
  const write = (text: string, last: boolean): void => {
    let xml = carry + text;
    carry = '';
    if (!last && xml.endsWith('\r')) {
      carry = '\r';
      xml = xml.slice(0, -1);
    }
    parser.write(normalizeLineEndings(xml));
  };
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => write(decoder.write(chunk), false));
    stream.on('end', () => {
      write(decoder.end(), true);
      parser.end();
      resolve();
    });
    stream.on('error', reject);
  });
}

interface Relationships {
  /** Targets by relationship type, in document order */
  byType: Map<string, string[]>;
  /** Targets by relationship id, as a hyperlink's r:id names them */
  byId: Map<string, string>;
}

/**
 * Splits a zip path into its folder and name, as mammoth's zipfile.splitPath does.
 * @param partPath path in the zip
 * @returns folder ('' at the root) and name
 */
function splitPath(partPath: string): { dirname: string; basename: string } {
  const slash = partPath.lastIndexOf('/');
  return slash === -1
    ? { dirname: '', basename: partPath }
    : {
        dirname: partPath.slice(0, slash),
        basename: partPath.slice(slash + 1),
      };
}

/**
 * Joins zip paths as mammoth's zipfile.joinPath does: an absolute path starts over, and nothing is normalized.
 * @param paths the paths, empty ones skipped
 * @returns the joined path
 */
function joinPath(...paths: string[]): string {
  let relevant: string[] = [];
  for (const segment of paths) {
    if (!segment) continue;
    if (segment.startsWith('/')) relevant = [segment];
    else relevant.push(segment);
  }
  return relevant.join('/');
}

/**
 * Reads the relationships of a part (word/_rels/document.xml.rels for word/document.xml, _rels/.rels for the
 * package). A missing part has none.
 * @param zip the DOCX package
 * @param partPath path of the part, '' for the package
 * @returns the relationships by type and by id
 */
async function readRelationships(
  zip: JSZip,
  partPath: string,
): Promise<Relationships> {
  const relationships: Relationships = { byType: new Map(), byId: new Map() };
  const { dirname, basename } = splitPath(partPath);
  const xml = await zip
    .file(joinPath(dirname, '_rels', `${basename}.rels`))
    ?.async('string');
  if (!xml) return relationships;
  walkXml(xml, (name, attributes, ancestors) => {
    if (name !== 'relationships:Relationship' || ancestors.length !== 1) return;
    const { Id: id, Type: type, Target: target } = attributes;
    if (target === undefined) return;
    if (id !== undefined) relationships.byId.set(id, target);
    if (type !== undefined) {
      const targets = relationships.byType.get(type);
      if (targets) targets.push(target);
      else relationships.byType.set(type, [target]);
    }
  });
  return relationships;
}

/**
 * mammoth's findPartPath: the first target of the type that exists in the package, or else the fallback path.
 * @param zip the DOCX package
 * @param relationships relationships of the part the target is relative to
 * @param type relationship type
 * @param basePath folder of that part
 * @param fallbackPath path used when no target exists
 * @returns path of the part, which may not exist
 */
function findPartPath(
  zip: JSZip,
  relationships: Relationships,
  type: string,
  basePath: string,
  fallbackPath: string,
): string {
  for (const target of relationships.byType.get(type) ?? []) {
    const partPath = joinPath(basePath, target).replace(/^\//, '');
    if (zip.file(partPath)) return partPath;
  }
  return fallbackPath;
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
  await readPart(documentFile.nodeStream('nodebuffer'), body);
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
        await readPart(notesFile.nodeStream('nodebuffer'), reader);
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

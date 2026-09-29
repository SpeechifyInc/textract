import type { Options } from '../../types.js';
import type { Piece } from './content.js';
import type { Field } from './fields.js';
import type { Lists, ListTag } from './lists.js';
import type { TableCell, TableRow } from './tables.js';
import type { Reader, XmlEvent } from './xml.js';

/*
 * What the element readers share while reading one part: the elements open around the current one, and field state.
 */

/** The marker the HTML extractor put where a paragraph, list item or line break began; it becomes a line break */
export const BLOCK = '|||||';

/** Stands for a note reference inside a note until the notes are numbered; XML text cannot contain U+0000 */
export const NOTE_REFERENCE = '\u0000';

export type NoteType = 'footnote' | 'endnote';

export interface NoteReference {
  type: NoteType;
  id: string;
}

export type OpenEvent = Extract<XmlEvent, { type: 'open' }>;

/** A paragraph being read */
export interface Paragraph {
  styleId?: string;
  numId?: string;
  ilvl?: string;
  /** Its mark is deleted, so it joins the next paragraph */
  deleted: boolean;
  /** It holds an image or a checkbox, so it is written even without text */
  written: boolean;
  /** Text boxes, written after it */
  extras: string[];
}

/** An element mammoth's HTML nests blocks in (the body, a table cell, a text box), with the list it left open */
export interface BlockContainer {
  listPath?: ListTag[];
}

/** A content control; a checkbox one has its first character replaced */
export interface ContentControl {
  checkbox: boolean;
  claimed: boolean;
}

/** A table being read: its rows, and what the HTML parser moves in front of it */
export interface Table {
  rows: (TableRow | string)[];
  fostered: string;
}

/** A row being read */
export interface Row {
  cells: (TableCell | string)[];
  header: boolean;
  deleted: boolean;
}

/** What the readers share while reading a part: the elements open around the current one, and field state */
export interface State {
  readonly options: Options;
  /** The part's relationship targets by id */
  readonly relationships: Map<string, string>;
  readonly lists: Lists;
  /** Note references found so far in the body; unused when reading notes */
  readonly noteReferences: NoteReference[];
  readonly notesPart: boolean;
  readonly paragraphs: Paragraph[];
  readonly containers: BlockContainer[];
  readonly controls: ContentControl[];
  readonly tables: Table[];
  readonly rows: Row[];
  /** Complex fields open, innermost last, and the instruction of the one begun last */
  readonly fields: Field[];
  instruction: string;
  /** Paragraphs whose mark is deleted, waiting for the next paragraph */
  pendingDeleted?: { text: string; extras: string[]; written: boolean };
  sawBody: boolean;
  /**
   * The element readers in reader.ts, which the readers of paragraphs, tables and drawings call for the elements
   * nested in theirs: the children of the current element as content, and one element.
   */
  readonly readChildren: (parent: string) => Reader<string>;
  readonly readElement: (event: OpenEvent, parent: string) => Reader<Piece>;
}

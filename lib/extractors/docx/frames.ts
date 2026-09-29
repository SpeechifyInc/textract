import type { ListTag } from './lists.js';
import type { TableCell, TableRow } from './tables.js';

/** An element the reader has open, with the text written inside it so far */
export interface Frame {
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

/**
 * A new, empty frame.
 * @param kind what the element is to the reader
 * @returns the frame
 */
export function newFrame(kind: Frame['kind']): Frame {
  return { kind, parts: [], extras: [] };
}

/**
 * The innermost open frame of a kind.
 * @param frames open frames, outermost first
 * @param kind the kind
 * @returns the frame, if one is open
 */
export function closest(
  frames: Frame[],
  kind: Frame['kind'],
): Frame | undefined {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].kind === kind) return frames[i];
  }
  return undefined;
}

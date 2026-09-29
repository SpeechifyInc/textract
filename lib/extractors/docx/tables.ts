/* eslint-disable jsdoc/require-yields -- every reader yields only to take the next XML event (see Reader in xml.ts) */
import { Content } from './content.js';
import type { Row, State, Table } from './state.js';
import { attributesOf, type Reader } from './xml.js';

export interface TableCell {
  content: string;
  colSpan: number;
  vMerge: boolean;
  removed?: boolean;
}

export interface TableRow {
  header: boolean;
  cells: (TableCell | string)[];
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
export function renderTable(rows: (TableRow | string)[]): string {
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
 * A bookmark, written as an empty <a id> that the HTML extractor spaces out (' <a id> </a>'). Directly in a table or a
 * row the HTML parser moves the <a> in front of the table with the space inside it; the space before it stays put.
 * @param attributes its attributes
 * @param parent its parent's name
 * @param state reading state
 * @returns the bookmark's text
 */
export function bookmark(
  attributes: Record<string, string>,
  parent: string,
  state: State,
): string {
  if (attributes['w:name'] === '_GoBack') return '';
  const table = state.tables.at(-1);
  const row = state.rows.at(-1);
  if (table && parent === 'w:tbl') {
    table.fostered += ' ';
    table.rows.push(' ');
    return '';
  }
  if (table && row && parent === 'w:tr') {
    table.fostered += ' ';
    row.cells.push(' ');
    return '';
  }
  return '  ';
}

/**
 * A table. Rows add themselves to it; anything written in it outside its rows (a malformed file) is moved in front of
 * it, as the HTML parser does.
 * @param state reading state
 * @returns its text
 */
export function* readTable(state: State): Reader<string> {
  const table: Table = { rows: [], fostered: '' };
  state.tables.push(table);
  const stray = yield* state.readChildren('w:tbl');
  state.tables.pop();
  state.containers[state.containers.length - 1].listPath = undefined;
  return table.fostered + stray + renderTable(table.rows);
}

/**
 * A table row. It adds itself to the table around it, unless it is deleted; cells add themselves to it.
 * @param state reading state
 * @returns nothing written in place
 */
export function* readRow(state: State): Reader<string> {
  const row: Row = { cells: [], header: false, deleted: false };
  state.rows.push(row);
  yield* state.readChildren('w:tr');
  state.rows.pop();
  const table = state.tables.at(-1);
  if (table && !row.deleted) table.rows.push(row);
  return '';
}

/**
 * A row's properties: its deletion mark and header mark (any w:tblHeader, whatever its w:val, as in mammoth).
 * @param state reading state
 * @returns nothing written
 */
export function* readRowProperties(state: State): Reader<string> {
  const marks = yield* attributesOf(['w:del', 'w:tblHeader']);
  const row = state.rows.at(-1);
  if (row && 'w:del' in marks) row.deleted = true;
  if (row && 'w:tblHeader' in marks) row.header = true;
  return '';
}

/**
 * A table cell, with its column span and vertical merge. It adds itself to the row around it; outside a row it is
 * written in place.
 * @param state reading state
 * @returns its text when outside a row
 */
export function* readCell(state: State): Reader<string> {
  const cell: TableCell = { content: '', colSpan: 1, vMerge: false };
  let spanned = false;
  let merged = false;
  const content = new Content();
  state.containers.push({});
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (event.name !== 'w:tcPr') {
      content.add(yield* state.readElement(event, 'w:tc'));
      continue;
    }
    const properties = yield* attributesOf(['w:gridSpan', 'w:vMerge']);
    if (!spanned && 'w:gridSpan' in properties) {
      spanned = true;
      const span = properties['w:gridSpan'];
      cell.colSpan = span ? parseInt(span, 10) : 1;
    }
    if (!merged && 'w:vMerge' in properties) {
      merged = true;
      const value = properties['w:vMerge'];
      cell.vMerge = value === 'continue' || !value;
    }
  }
  state.containers.pop();
  cell.content = content.toString();
  const row = state.rows.at(-1);
  if (!row) return ` ${cell.content} `;
  row.cells.push(cell);
  return '';
}

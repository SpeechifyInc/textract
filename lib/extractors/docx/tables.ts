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

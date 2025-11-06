import path from 'node:path';
import * as XLSX from 'xlsx';
import type { Options } from '../types.js';

/**
 * Extract text from a XLS file
 * @param filePath path to file
 * @param _options options (not used)
 * @returns extracted text
 */
function extractText(filePath: string, _options: Options): string {
  let wb: XLSX.WorkBook;

  try {
    wb = XLSX.readFile(filePath);
  } catch (err) {
    throw new Error(
      `Could not extract ${path.basename(filePath)}, ${(err as Error).message}`,
    );
  }

  const sheets = wb.Sheets;
  let result = '';
  for (const key of Object.keys(sheets)) {
    result += XLSX.utils.sheet_to_csv(sheets[key]);
  }

  return result;
}

export default {
  types: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.oasis.opendocument.spreadsheet-template',
  ],
  extract: extractText,
};

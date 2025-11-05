import path from 'node:path';
import J from 'j';
import type { Options } from '../types.js';

/**
 * Extract text from a XLS file
 * @param filePath path to file
 * @param _options options (not used)
 * @returns extracted text
 */
function extractText(filePath: string, _options: Options): string {
  let wb: any;
  let CSVs: any;

  try {
    wb = J.readFile(filePath);
    CSVs = J.utils.to_csv(wb);
  } catch (err) {
    throw new Error(
      `Could not extract ${path.basename(filePath)}, ${(err as Error).message}`,
    );
  }

  let result = '';
  for (const key of Object.keys(CSVs)) {
    result += CSVs[key];
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

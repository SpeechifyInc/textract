import type { Options } from '../types.js';
import docOSX from './doc-osx.js';
import doc from './doc.js';
import docx from './docx.js';
import dxf from './dxf.js';
import epub from './epub.js';
import html from './html.js';
import images from './images.js';
import md from './md.js';
import odt from './odt.js';
import pdf from './pdf.js';
import pptx from './pptx.js';
import rtf from './rtf.js';
import text from './text.js';
import xls from './xls.js';

export interface Extractor {
  types: (string | RegExp)[];
  extract: (filePath: string, options: Options) => string | Promise<string>;
  test?: (options?: Options) => Promise<boolean>;
}

const extractors: Extractor[] = [
  docOSX,
  doc,
  docx,
  dxf,
  epub,
  html,
  images,
  md,
  odt,
  pdf,
  pptx,
  rtf,
  text,
  xls,
];

export default extractors;

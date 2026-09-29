import { closest, newFrame, type Frame } from './frames.js';

/** Where mammoth looks for a picture in a DrawingML drawing, each a direct child of the one before */
const PICTURE_PATH = ['a:graphic', 'a:graphicData', 'pic:pic', 'pic:blipFill'];

/**
 * Frames whose children are not document content: property elements, alternate content and drawings. They are read
 * only for what changes the text: a field run's formatting, a paragraph's style, numbering and deletion mark, a row's
 * deletion and header marks, a cell's spans, a content control's checkbox, the fallback of alternate content, and a
 * drawing's pictures and alt text.
 */
export const PROPERTY_KINDS = new Set<Frame['kind']>([
  'runProps',
  'pPr',
  'numPr',
  'pPrRPr',
  'trPr',
  'tcPr',
  'sdtPr',
  'alternate',
  'drawing',
  'drawingInner',
]);

/**
 * Reads an element inside a DrawingML drawing: pictures only, as in mammoth, so text boxes drawn with DrawingML are
 * not read.
 * @param frames open frames, outermost first; the last one is a drawing or inside one
 * @param name the element's resolved name
 * @param attributes its resolved attributes
 * @returns a frame to open for the element, or undefined to skip it with its content
 */
function openInDrawing(
  frames: Frame[],
  name: string,
  attributes: Record<string, string>,
): Frame | undefined {
  const top = frames[frames.length - 1];
  const drawing = closest(frames, 'drawing') ?? top;
  if (name === 'wp:docPr' && top === drawing && !drawing.docPr) {
    drawing.docPr = true;
    drawing.alt = attributes.descr?.trim()
      ? attributes.descr
      : attributes.title;
    return undefined;
  }
  if (name === 'a:blip') {
    const depth = frames.length;
    if (
      (attributes['r:embed'] || attributes['r:link']) &&
      frames[depth - PICTURE_PATH.length - 1] === drawing &&
      PICTURE_PATH.every(
        (step, i) => frames[depth - PICTURE_PATH.length + i].name === step,
      )
    )
      drawing.images = (drawing.images ?? 0) + 1;
    return undefined;
  }
  return { ...newFrame('drawingInner'), name };
}

/**
 * Reads an element opened directly inside one of PROPERTY_KINDS.
 * @param frames open frames, outermost first; the last one is of a PROPERTY_KINDS kind
 * @param name the element's resolved name
 * @param attributes its resolved attributes
 * @returns a frame to open for the element, or undefined to skip it with its content
 */
export function openProperty(
  frames: Frame[],
  name: string,
  attributes: Record<string, string>,
): Frame | undefined {
  const top = frames[frames.length - 1];
  switch (top.kind) {
    case 'runProps': {
      const on = !['false', '0', 'off'].includes(attributes['w:val'] ?? '');
      const run = closest(frames, 'hyperlink');
      if (run && on && ['w:b', 'w:i', 'w:strike'].includes(name))
        run.format = (run.format ?? '') + name;
      if (
        run &&
        name === 'w:vertAlign' &&
        ['superscript', 'subscript'].includes(attributes['w:val'] ?? '')
      ) {
        run.format = (run.format ?? '') + (attributes['w:val'] ?? '');
      }
      return undefined;
    }
    case 'pPr': {
      const paragraph = closest(frames, 'p');
      if (name === 'w:rPr') return newFrame('pPrRPr');
      if (
        name === 'w:numPr' &&
        paragraph &&
        paragraph.numId === undefined &&
        paragraph.ilvl === undefined
      )
        return newFrame('numPr');
      if (name === 'w:pStyle' && paragraph && paragraph.styleId === undefined)
        paragraph.styleId = attributes['w:val'];
      return undefined;
    }
    case 'numPr': {
      const paragraph = closest(frames, 'p');
      if (paragraph && name === 'w:ilvl' && paragraph.ilvl === undefined)
        paragraph.ilvl = attributes['w:val'];
      if (paragraph && name === 'w:numId' && paragraph.numId === undefined)
        paragraph.numId = attributes['w:val'];
      return undefined;
    }
    case 'pPrRPr': {
      const paragraph = closest(frames, 'p');
      if (paragraph && name === 'w:del') paragraph.deleted = true;
      return undefined;
    }
    case 'trPr': {
      const row = closest(frames, 'tr');
      if (row && name === 'w:del') row.deleted = true;
      // mammoth takes any w:tblHeader as a header row, whatever its w:val
      if (row && name === 'w:tblHeader') row.header = true;
      return undefined;
    }
    case 'tcPr': {
      const cell = closest(frames, 'tc');
      if (cell && name === 'w:gridSpan' && cell.colSpan === undefined) {
        const gridSpan = attributes['w:val'];
        cell.colSpan = gridSpan ? parseInt(gridSpan, 10) : 1;
      }
      if (cell && name === 'w:vMerge' && cell.vMerge === undefined) {
        const val = attributes['w:val'];
        cell.vMerge = val === 'continue' || !val;
      }
      return undefined;
    }
    case 'sdtPr': {
      const sdt = closest(frames, 'sdt');
      if (sdt && name === 'wordml:checkbox') sdt.checkbox = true;
      return undefined;
    }
    case 'alternate':
      return name === 'mc:Fallback' ? newFrame('container') : undefined;
    default:
      return openInDrawing(frames, name, attributes);
  }
}

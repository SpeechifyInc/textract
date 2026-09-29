/* eslint-disable jsdoc/require-yields -- every reader yields only to take the next XML event (see Reader in xml.ts) */
import { Content } from './content.js';
import type { State } from './state.js';
import { skip, type Reader } from './xml.js';

/*
 * Pictures and text boxes: VML text boxes are read, DrawingML drawings only for their pictures' alt text.
 */

/** Where mammoth looks for pictures in a DrawingML drawing, each a direct child of the one before */
const PICTURE_PATH = ['a:graphic', 'a:graphicData', 'pic:pic', 'pic:blipFill'];

/**
 * A VML picture (w:pict) and the text boxes in it, which are written after the paragraph that holds them.
 * @param state reading state
 * @returns their text when outside a paragraph
 */
export function* readTextBoxes(state: State): Reader<string> {
  state.containers.push({});
  const content = yield* state.readChildren('w:pict');
  state.containers.pop();
  const paragraph = state.paragraphs.at(-1);
  if (!paragraph) return content;
  paragraph.extras.push(content);
  return '';
}

/**
 * Counts the pictures at the end of PICTURE_PATH below an element of a drawing.
 * @param name the element's name
 * @param depth how far along PICTURE_PATH it should be
 * @returns the number of pictures (a:blip with an embedded or linked image)
 */
function* countPictures(name: string, depth: number): Reader<number> {
  if (name !== PICTURE_PATH[depth]) {
    yield* skip();
    return 0;
  }
  let pictures = 0;
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    const { attributes } = event;
    const isPicture =
      depth === PICTURE_PATH.length - 1 &&
      event.name === 'a:blip' &&
      Boolean(attributes['r:embed'] || attributes['r:link']);
    if (isPicture) {
      pictures++;
      yield* skip();
    } else {
      pictures += yield* countPictures(event.name, depth + 1);
    }
  }
  return pictures;
}

/**
 * A DrawingML drawing: pictures only, so text boxes drawn with DrawingML are not read, as in mammoth. Each picture is
 * an <img> whose alt text is the drawing's description, or else its title.
 * @param state reading state
 * @returns the alt text of each picture, when asked for
 */
export function* readDrawing(state: State): Reader<string> {
  let alt: string | undefined;
  let docPr = false;
  let pictures = 0;
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (event.name === 'wp:docPr' && !docPr) {
      docPr = true;
      const { descr, title } = event.attributes;
      alt = descr?.trim() ? descr : title;
      yield* skip();
    } else {
      pictures += yield* countPictures(event.name, 0);
    }
  }
  if (pictures === 0) return '';
  const paragraph = state.paragraphs.at(-1);
  if (paragraph) paragraph.written = true;
  return state.options.includeAltText && alt ? ` ${alt} `.repeat(pictures) : '';
}

/**
 * Alternate content: mammoth reads only the fallback.
 * @param state reading state
 * @returns the fallback's text
 */
export function* readAlternateContent(state: State): Reader<string> {
  const content = new Content();
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (event.name === 'mc:Fallback')
      content.add(yield* state.readChildren(event.name));
    else yield* skip();
  }
  return content.toString();
}

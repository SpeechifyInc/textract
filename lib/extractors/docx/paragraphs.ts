/* eslint-disable jsdoc/require-yields -- every reader yields only to take the next XML event (see Reader in xml.ts) */
import * as dingbatToUnicode from 'dingbat-to-unicode';
import { Content, type Piece } from './content.js';
import { parseInstruction } from './fields.js';
import { listLevel, openBlock } from './lists.js';
import {
  BLOCK,
  NOTE_REFERENCE,
  type ContentControl,
  type Paragraph,
  type State,
} from './state.js';
import { attributesOf, skip, textContent, type Reader } from './xml.js';

/*
 * Paragraphs and what is in them: runs, text, hyperlinks, complex fields, note references, symbols and content
 * controls.
 */

/**
 * The block markers a written paragraph opens, as a plain paragraph or a list item; see openBlock in lists.ts.
 * @param paragraph the paragraph
 * @param state reading state
 * @returns the markers
 */
function blockMarkers(paragraph: Paragraph, state: State): string {
  const container = state.containers[state.containers.length - 1];
  const { listPath, markers } = openBlock(
    container.listPath,
    listLevel(state.lists, paragraph),
  );
  container.listPath = listPath;
  return BLOCK.repeat(markers);
}

/**
 * A paragraph. An empty one is not written (mammoth's ignoreEmptyParagraphs), unless it holds an image or a checkbox.
 * It gets one block marker, or one per <li> it opens as a list item: the HTML extractor marks only opening block tags
 * (its closing-tag pattern needs a space after `</`). Its text boxes follow it.
 * @param state reading state
 * @returns its text
 */
export function* readParagraph(state: State): Reader<string> {
  const paragraph: Paragraph = { deleted: false, written: false, extras: [] };
  state.paragraphs.push(paragraph);
  const content = yield* state.readChildren('w:p');
  state.paragraphs.pop();

  const pending = state.pendingDeleted;
  if (paragraph.deleted) {
    // A deleted paragraph mark joins this paragraph, text boxes and images included, to the next one
    state.pendingDeleted = {
      text: (pending?.text ?? '') + content,
      extras: [...(pending?.extras ?? []), ...paragraph.extras],
      written: (pending?.written ?? false) || paragraph.written,
    };
    return '';
  }
  state.pendingDeleted = undefined;
  const merged = (pending?.text ?? '') + content;
  const extras = [...(pending?.extras ?? []), ...paragraph.extras].join('');
  if (merged.length === 0 && !pending?.written && !paragraph.written)
    return extras;
  return blockMarkers(paragraph, state) + merged + extras;
}

/**
 * A paragraph's properties: its style, numbering and deletion mark; the first of each counts.
 * @param state reading state
 * @returns nothing written
 */
export function* readParagraphProperties(state: State): Reader<string> {
  const paragraph = state.paragraphs.at(-1);
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    const value = event.attributes['w:val'];
    if (event.name === 'w:pStyle' && paragraph?.styleId === undefined) {
      if (paragraph) paragraph.styleId = value;
      yield* skip();
    } else if (
      event.name === 'w:numPr' &&
      paragraph &&
      paragraph.numId === undefined &&
      paragraph.ilvl === undefined
    ) {
      const numbering = yield* attributesOf(['w:ilvl', 'w:numId']);
      paragraph.ilvl = numbering['w:ilvl'];
      paragraph.numId = numbering['w:numId'];
    } else if (event.name === 'w:rPr') {
      const marks = yield* attributesOf(['w:del']);
      if (paragraph && 'w:del' in marks) paragraph.deleted = true;
    } else {
      yield* skip();
    }
  }
  return '';
}

/**
 * The formatting elements mammoth wraps a run in.
 * @returns their names, in document order
 */
function* readRunFormat(): Reader<string> {
  let format = '';
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    const value = event.attributes['w:val'] ?? '';
    const on = !['false', '0', 'off'].includes(value);
    if (on && ['w:b', 'w:i', 'w:strike'].includes(event.name))
      format += event.name;
    if (
      event.name === 'w:vertAlign' &&
      ['superscript', 'subscript'].includes(value)
    )
      format += value;
    yield* skip();
  }
  return format;
}

/**
 * A run. Inside a hyperlink field every run is its own link, wrapped in the run's formatting (bold, italic,
 * strikethrough, superscript, subscript), so runs merge into one link only when their formatting matches.
 * @param state reading state
 * @returns its text, or a link
 */
export function* readRun(state: State): Reader<Piece> {
  const link = state.fields.findLast(
    (field) => field.type === 'hyperlink',
  )?.link;
  const content = new Content();
  let format = '';
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (link !== undefined && event.name === 'w:rPr')
      format += yield* readRunFormat();
    else content.add(yield* state.readElement(event, 'w:r'));
  }
  const text = content.toString();
  return link === undefined ? text : { link: `${link}|${format}`, text };
}

/**
 * Text. In a checkbox content control the first character is the box, which mammoth replaces with an <input>; an
 * inner control claims its character before the ones around it.
 * @param state reading state
 * @returns the text
 */
export function* readText(state: State): Reader<string> {
  const value = yield* textContent();
  const control =
    value.length > 0
      ? state.controls.findLast((sdt) => sdt.checkbox && !sdt.claimed)
      : undefined;
  if (!control) return value;
  control.claimed = true;
  const paragraph = state.paragraphs.at(-1);
  if (paragraph) paragraph.written = true;
  return '';
}

/**
 * A hyperlink element. Without a target mammoth reads its children as plain content.
 * @param attributes its attributes
 * @param state reading state
 * @returns a link, or its text
 */
export function* readHyperlink(
  attributes: Record<string, string>,
  state: State,
): Reader<Piece> {
  const relationshipId = attributes['r:id'];
  const anchor = attributes['w:anchor'];
  const text = yield* state.readChildren('w:hyperlink');
  if (!relationshipId && !anchor) return text;
  let target = `anchor:${anchor}`;
  if (relationshipId) {
    const href = state.relationships.get(relationshipId) ?? '';
    target = `href:${anchor ? `${href.split('#')[0]}#${anchor}` : href}`;
  }
  return { link: `${target} ${attributes['w:tgtFrame'] ?? ''}|`, text };
}

/**
 * A complex field character. mammoth parses the instruction at separate, or at end when there is no separate.
 * @param type begin, separate or end
 * @param state reading state
 */
export function fieldChar(type: string | undefined, state: State): void {
  if (type === 'begin') {
    state.fields.push({ type: 'begin' });
    state.instruction = '';
  } else if (type === 'separate') {
    if (state.fields.pop())
      state.fields.push(parseInstruction(state.instruction));
  } else if (type === 'end') {
    const field = state.fields.pop();
    const ended =
      field?.type === 'begin' ? parseInstruction(state.instruction) : field;
    // A checkbox field is written as an <input>, so its paragraph is written
    const paragraph = state.paragraphs.at(-1);
    if (ended?.type === 'checkbox' && paragraph) paragraph.written = true;
  }
}

/**
 * A footnote or endnote reference, written `[n]`. Inside a note it is numbered when the notes are written.
 * @param name w:footnoteReference or w:endnoteReference
 * @param attributes its attributes
 * @param state reading state
 * @returns the reference's text
 */
export function noteReference(
  name: string,
  attributes: Record<string, string>,
  state: State,
): string {
  if (state.notesPart) return NOTE_REFERENCE;
  state.noteReferences.push({
    type: name === 'w:footnoteReference' ? 'footnote' : 'endnote',
    id: attributes['w:id'],
  });
  return ` [${state.noteReferences.length}] `;
}

/**
 * A content control, read as its content; a checkbox control is noted for its first character (see text).
 * @param state reading state
 * @returns its text
 */
export function* readContentControl(state: State): Reader<string> {
  const control: ContentControl = { checkbox: false, claimed: false };
  state.controls.push(control);
  const content = new Content();
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (event.name === 'w:sdtPr') {
      const properties = yield* attributesOf(['wordml:checkbox']);
      if ('wordml:checkbox' in properties) control.checkbox = true;
    } else {
      content.add(yield* state.readElement(event, 'w:sdt'));
    }
  }
  state.controls.pop();
  return content.toString();
}

/**
 * A symbol, mapped from its dingbat font to Unicode.
 * @param attributes w:font and w:char
 * @returns the character, or nothing when it has no mapping
 */
export function symbol(attributes: Record<string, string>): string {
  const font = attributes['w:font'];
  const char = attributes['w:char'];
  const mapped =
    dingbatToUnicode.hex(font, char) ??
    (/^F0..$/.test(char ?? '')
      ? dingbatToUnicode.hex(font, char.substring(2))
      : undefined);
  return mapped?.string ?? '';
}

import * as dingbatToUnicode from 'dingbat-to-unicode';
import type { Options } from '../../types.js';
import { parseInstruction, type Field } from './fields.js';
import { closest as closestFrame, newFrame, type Frame } from './frames.js';
import { listLevel, openBlock, type Lists } from './lists.js';
import { openProperty, PROPERTY_KINDS } from './properties.js';
import { renderTable } from './tables.js';
import type { XmlHandler } from './xml.js';

/** The marker the HTML extractor put where a paragraph, list item or line break began; it becomes a line break */
export const BLOCK = '|||||';

/** Stands for a note reference inside a note until the notes are numbered; XML text cannot contain U+0000 */
export const NOTE_REFERENCE = '\u0000';

/** A VML image's title (o:title); mammoth never mapped this namespace, so it wrote "undefined" as the alt text. */
const VML_TITLE = '{urn:schemas-microsoft-com:office:office}title';

/** Elements whose children are read as they are (mammoth's readChildElements). */
const CONTAINERS = new Set([
  'w:body',
  'w:ins',
  'w:object',
  'w:smartTag',
  'w:drawing',
  'v:roundrect',
  'v:shape',
  'v:textbox',
  'w:txbxContent',
  'v:group',
  'v:rect',
  'mc:Fallback',
  'w:sdtContent',
]);

export type NoteType = 'footnote' | 'endnote';

export interface NoteReference {
  type: NoteType;
  id: string;
}

/**
 * Streams one WordprocessingML part (document, footnotes or endnotes) into text with block markers.
 */
export class PartReader implements XmlHandler {
  private readonly frames: Frame[] = [newFrame('root')];
  private skipDepth = 0;
  private readonly fields: Field[] = [];
  /** Instruction text of the field begun last (mammoth keeps one buffer, reset by every begin) */
  private instruction = '';
  /** A paragraph whose mark is deleted, waiting to be joined to the next paragraph */
  private pendingDeleted:
    | { parts: string[]; extras: string[]; written: boolean }
    | undefined;
  /** Whether the part had a w:body */
  sawBody = false;
  /** Footnote/endnote bodies by id, when reading a notes part. */
  readonly notes = new Map<string, string>();
  private noteId: string | undefined;

  constructor(
    private readonly options: Options,
    private readonly noteReferences: NoteReference[],
    private readonly notesPart: boolean,
    /** The part's relationship targets by id, to tell hyperlink targets apart */
    private readonly relationships: Map<string, string>,
    private readonly lists: Lists,
  ) {}

  get text(): string {
    return this.frames[0].parts.join('');
  }

  private get top(): Frame {
    return this.frames[this.frames.length - 1];
  }

  private push(kind: Frame['kind']): Frame {
    const frame = newFrame(kind);
    this.frames.push(frame);
    return frame;
  }

  private emit(text: string): void {
    // Nothing written is nothing in mammoth's HTML either, so links on both sides of it still merge
    if (text.length === 0) return;
    this.top.parts.push(text);
    this.top.lastLink = undefined;
  }

  /**
   * The element mammoth's HTML nests this block in (the body, a cell or a text box); other wrappers are flattened.
   * @returns the innermost block container frame
   */
  private blockContext(): Frame {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const { kind } = this.frames[i];
      if (kind === 'root' || kind === 'tc' || kind === 'pict')
        return this.frames[i];
    }
    return this.frames[0];
  }

  /**
   * Block markers for a written paragraph; see openBlock in lists.ts.
   * @param frame the paragraph
   * @returns marker count
   */
  private blockMarkers(frame: Frame): number {
    const context = this.blockContext();
    const { listPath, markers } = openBlock(
      context.listPath,
      listLevel(this.lists, frame),
    );
    context.listPath = listPath;
    return markers;
  }

  private closest(kind: Frame['kind']): Frame | undefined {
    return closestFrame(this.frames, kind);
  }

  onOpen(name: string, attributes: Record<string, string>): void {
    if (this.skipDepth > 0) {
      this.skipDepth++;
      return;
    }
    const { top } = this;

    if (PROPERTY_KINDS.has(top.kind)) {
      const frame = openProperty(this.frames, name, attributes);
      if (frame) this.frames.push(frame);
      else this.skipDepth = 1;
      return;
    }

    switch (name) {
      case 'w:document':
        this.push('container');
        return;
      case 'w:footnotes':
      case 'w:endnotes':
        if (this.notesPart) {
          this.push('container');
          return;
        }
        break;
      case 'w:footnote':
      case 'w:endnote': {
        const type = attributes['w:type'];
        if (
          this.notesPart &&
          type !== 'separator' &&
          type !== 'continuationSeparator'
        ) {
          this.noteId = attributes['w:id'];
          this.frames[0].listPath = undefined;
          this.push('container');
          return;
        }
        break;
      }
      case 'w:p':
        this.push('p');
        return;
      case 'w:pPr':
        this.push('pPr');
        return;
      case 'w:tr':
        this.push('tr');
        return;
      case 'w:trPr':
        this.push('trPr');
        return;
      case 'w:tc':
        this.push('tc');
        return;
      case 'w:tcPr':
        if (top.kind === 'tc') {
          this.push('tcPr');
          return;
        }
        break;
      case 'w:hyperlink': {
        // Without a target mammoth reads the children as plain content, not as a link
        const relationshipId = attributes['r:id'];
        const anchor = attributes['w:anchor'];
        if (!relationshipId && !anchor) {
          this.push('container');
          return;
        }
        const href = relationshipId
          ? (this.relationships.get(relationshipId) ?? '')
          : undefined;
        const target =
          href === undefined
            ? `anchor:${anchor}`
            : `href:${anchor ? `${href.split('#')[0]}#${anchor}` : href}`;
        this.push('hyperlink').link =
          `${target} ${attributes['w:tgtFrame'] ?? ''}`;
        return;
      }
      case 'w:pict':
        this.push('pict');
        return;
      case 'wp:inline':
      case 'wp:anchor':
        this.push('drawing');
        return;
      case 'mc:AlternateContent':
        this.push('alternate');
        return;
      case 'w:sdt':
        this.push('sdt');
        return;
      case 'w:sdtPr':
        if (top.kind === 'sdt') {
          this.push('sdtPr');
          return;
        }
        break;
      case 'w:t':
        this.push('text');
        return;
      case 'w:tab':
        this.emit('\t');
        this.skipDepth = 1;
        return;
      case 'w:noBreakHyphen':
        this.emit('‑');
        this.skipDepth = 1;
        return;
      case 'w:softHyphen':
        this.emit('­');
        this.skipDepth = 1;
        return;
      case 'w:sym': {
        const font = attributes['w:font'];
        const char = attributes['w:char'];
        const symbol =
          dingbatToUnicode.hex(font, char) ??
          (/^F0..$/.test(char ?? '')
            ? dingbatToUnicode.hex(font, char.substring(2))
            : undefined);
        if (symbol) this.emit(symbol.string);
        this.skipDepth = 1;
        return;
      }
      case 'w:br': {
        // A line break is <br />, which the HTML extractor marks on both sides; page and column breaks write nothing
        const type = attributes['w:type'];
        if (type == null || type === 'textWrapping') this.emit(BLOCK + BLOCK);
        this.skipDepth = 1;
        return;
      }
      case 'w:bookmarkStart': {
        // Written as an empty <a id>, which the HTML extractor spaces out (' <a id> </a>'). Between rows or cells the
        // HTML parser moves the <a> in front of the table, with the space inside it; the space before it stays put.
        if (attributes['w:name'] !== '_GoBack') {
          const holder =
            top.kind === 'tbl' || top.kind === 'tr' ? top : undefined;
          const table = holder ? this.closest('tbl') : undefined;
          if (holder && table) {
            table.fostered = `${table.fostered ?? ''} `;
            if (holder.kind === 'tr') (holder.cells ??= []).push(' ');
            else (holder.rows ??= []).push(' ');
          } else {
            this.emit('  ');
          }
        }
        this.skipDepth = 1;
        return;
      }
      case 'w:tbl':
        this.push('tbl');
        return;
      case 'w:footnoteReference':
      case 'w:endnoteReference':
        // Inside a note a reference is numbered when the notes are written, in the order they are referenced
        if (this.notesPart) {
          this.emit(NOTE_REFERENCE);
          this.skipDepth = 1;
          return;
        }
        this.noteReferences.push({
          type: name === 'w:footnoteReference' ? 'footnote' : 'endnote',
          id: attributes['w:id'],
        });
        this.emit(` [${this.noteReferences.length}] `);
        this.skipDepth = 1;
        return;
      case 'w:fldChar':
        this.onFieldChar(attributes['w:fldCharType']);
        this.skipDepth = 1;
        return;
      case 'w:r': {
        // Inside a hyperlink field every run is its own link, wrapped in the run's formatting; see onClose
        const link = this.fields.findLast(
          (field) => field.type === 'hyperlink',
        )?.link;
        if (link === undefined) {
          this.push('container');
        } else {
          const run = this.push('hyperlink');
          run.link = link;
          run.fieldRun = true;
          run.format = '';
        }
        return;
      }
      case 'w:rPr':
        if (top.fieldRun) {
          this.push('runProps');
          return;
        }
        break;
      case 'w:instrText':
        this.push('instruction');
        return;
      case 'v:imagedata':
        if (
          this.options.includeAltText &&
          attributes['r:id'] &&
          attributes[VML_TITLE]
        ) {
          this.emit(` ${attributes[VML_TITLE]} `);
        }
        this.skipDepth = 1;
        return;
      default:
        if (name === 'w:body') this.sawBody = true;
        if (CONTAINERS.has(name)) {
          this.push('container');
          return;
        }
    }
    // Unknown and ignored elements are skipped with everything inside them, as in mammoth
    this.skipDepth = 1;
  }

  onText(text: string): void {
    if (
      this.skipDepth > 0 ||
      (this.top.kind !== 'text' && this.top.kind !== 'instruction')
    )
      return;
    this.top.parts.push(text);
  }

  onClose(): void {
    if (this.skipDepth > 0) {
      this.skipDepth--;
      return;
    }
    const frame = this.frames.pop();
    if (!frame) return;
    const content = frame.parts.join('');

    switch (frame.kind) {
      case 'instruction':
        // A field instruction is not document text; it is kept only to recognise hyperlink and checkbox fields
        this.instruction += content;
        return;
      case 'text': {
        // A checkbox content control shows its state as its first character, which mammoth replaces with an <input>;
        // an inner control claims a character before the ones around it
        const control =
          content.length > 0
            ? this.frames.findLast(
                (sdt) =>
                  sdt.kind === 'sdt' && sdt.checkbox && !sdt.checkboxDone,
              )
            : undefined;
        if (control) {
          control.checkboxDone = true;
          const paragraph = this.closest('p');
          if (paragraph) paragraph.written = true;
          return;
        }
        this.emit(content);
        return;
      }
      case 'p': {
        if (frame.deleted) {
          // A deleted paragraph mark joins this paragraph, text boxes and images included, to the next one
          this.pendingDeleted ??= { parts: [], extras: [], written: false };
          this.pendingDeleted.parts.push(content);
          this.pendingDeleted.extras.push(...frame.extras);
          this.pendingDeleted.written ||= frame.written ?? false;
          return;
        }
        const pending = this.pendingDeleted;
        this.pendingDeleted = undefined;
        const merged = (pending?.parts.join('') ?? '') + content;
        // An empty paragraph is not written (mammoth's ignoreEmptyParagraphs); one holding only an image is. Only an
        // opening block tag breaks the line in the HTML extractor (its closing-tag pattern needs a space after `</`),
        // so a paragraph gets one marker, and a list item one for each <li> it opens.
        const written = merged.length > 0 || pending?.written || frame.written;
        this.emit(
          (written ? BLOCK.repeat(this.blockMarkers(frame)) + merged : '') +
            (pending?.extras.join('') ?? '') +
            frame.extras.join(''),
        );
        return;
      }
      case 'tc': {
        const row = this.closest('tr');
        const cell = {
          content,
          colSpan: frame.colSpan ?? 1,
          vMerge: frame.vMerge ?? false,
        };
        if (row) (row.cells ??= []).push(cell);
        else this.emit(` ${content} `);
        return;
      }
      case 'tr': {
        // A deleted row is not read at all
        const table = this.closest('tbl');
        if (frame.deleted || !table) return;
        (table.rows ??= []).push({
          header: frame.header ?? false,
          cells: frame.cells ?? [],
        });
        return;
      }
      case 'tbl':
        this.blockContext().listPath = undefined;
        // Anything written in the table outside its rows (a malformed file) is moved in front of it, like `fostered`
        this.emit(
          (frame.fostered ?? '') + content + renderTable(frame.rows ?? []),
        );
        return;
      case 'hyperlink': {
        // An empty link writes nothing. Adjacent links to the same target are one <a> in mammoth's HTML, so the
        // HTML extractor spaces out the group, not each part.
        if (content.length === 0) return;
        const { parts } = this.top;
        const link = `${frame.link}|${frame.format ?? ''}`;
        if (this.top.lastLink === link && parts.at(-1) === ' ') {
          // Joined into the link before: its trailing space moves after this part (every run of a field is a link)
          parts[parts.length - 1] = content;
          parts.push(' ');
        } else {
          this.emit(' ');
          parts.push(content, ' ');
          this.top.lastLink = link;
        }
        return;
      }
      case 'pict': {
        // Text boxes are written after the paragraph that holds them
        const paragraph = this.closest('p');
        if (paragraph) paragraph.extras.push(content);
        else this.emit(content);
        return;
      }
      case 'drawing': {
        if (!frame.images) return;
        const paragraph = this.closest('p');
        if (paragraph) paragraph.written = true;
        if (this.options.includeAltText && frame.alt)
          this.emit(` ${frame.alt} `.repeat(frame.images));
        return;
      }
      case 'pPr':
      case 'tcPr':
      case 'numPr':
      case 'runProps':
      case 'pPrRPr':
      case 'trPr':
      case 'sdtPr':
      case 'drawingInner':
        return;
      default:
        if (
          this.notesPart &&
          this.noteId !== undefined &&
          this.frames.length === 2
        ) {
          this.notes.set(this.noteId, content);
          this.noteId = undefined;
          return;
        }
        this.emit(content);
    }
  }

  /**
   * mammoth's complex fields: the instruction is parsed at separate, or at end when there is no separate.
   * @param type the w:fldCharType (begin, separate or end)
   */
  private onFieldChar(type: string | undefined): void {
    if (type === 'begin') {
      this.fields.push({ type: 'begin' });
      this.instruction = '';
    } else if (type === 'separate') {
      if (this.fields.pop())
        this.fields.push(parseInstruction(this.instruction));
    } else if (type === 'end') {
      const field = this.fields.pop();
      const ended =
        field?.type === 'begin' ? parseInstruction(this.instruction) : field;
      // A checkbox field is written as an <input>, so its paragraph is written
      if (ended?.type === 'checkbox') {
        const paragraph = this.closest('p');
        if (paragraph) paragraph.written = true;
      }
    }
  }
}

/* eslint-disable jsdoc/require-yields -- every reader yields only to take the next XML event (see Reader) */
import { StringDecoder } from 'node:string_decoder';
import { Parser } from 'htmlparser2';

/*
 * XML plumbing for the DOCX reader: resolving names by namespace URI, xmldom's line-ending normalization, and
 * parsing a part whole (small parts: styles, numbering, relationships) or streamed (document, notes).
 */

/**
 * Namespaces mammoth reads, by the prefix it reads them under (its office-xml-reader map). Element and attribute
 * names are resolved through the document's own xmlns declarations to these prefixes, so a file that declares other
 * prefixes, or Strict OOXML, reads the same; a name in any other namespace matches nothing, as in mammoth.
 */
export const NAMESPACES: Record<string, string> = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing':
    'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
  'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',
  'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
  'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing': 'wp',
  'http://purl.oclc.org/ooxml/drawingml/main': 'a',
  'http://purl.oclc.org/ooxml/drawingml/picture': 'pic',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
  'urn:schemas-microsoft-com:vml': 'v',
  'urn:schemas-microsoft-com:office:word': 'office-word',
  'http://schemas.microsoft.com/office/word/2010/wordml': 'wordml',
  'http://schemas.openxmlformats.org/package/2006/relationships':
    'relationships',
};

/**
 * Resolves qualified names against the xmlns declarations in scope.
 */
export class NameResolver {
  private readonly scopes: Map<string, string>[] = [new Map<string, string>()];

  open(
    qname: string,
    attributes: Record<string, string>,
  ): { name: string; attributes: Record<string, string> } {
    let scope = this.scopes[this.scopes.length - 1];
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) {
        if (scope === this.scopes[this.scopes.length - 1])
          scope = new Map(scope);
        scope.set(key === 'xmlns' ? '' : key.slice('xmlns:'.length), value);
      }
    }
    this.scopes.push(scope);

    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== 'xmlns' && !key.startsWith('xmlns:'))
        resolved[this.resolve(key, scope, false)] = value;
    }
    return { name: this.resolve(qname, scope, true), attributes: resolved };
  }

  close(): void {
    this.scopes.pop();
  }

  private resolve(
    qname: string,
    scope: Map<string, string>,
    isElement: boolean,
  ): string {
    const colon = qname.indexOf(':');
    // An unprefixed attribute has no namespace; an unprefixed element takes the default one
    if (colon === -1 && !isElement) return qname;
    const prefix = colon === -1 ? '' : qname.slice(0, colon);
    const local = colon === -1 ? qname : qname.slice(colon + 1);
    const uri = scope.get(prefix);
    if (uri === undefined) return qname;
    const known = NAMESPACES[uri];
    return known ? `${known}:${local}` : `{${uri}}${local}`;
  }
}

/**
 * Line endings as xmldom (mammoth's XML parser) normalizes them before parsing, following XML 1.1: CR LF, CR NEL,
 * CR, NEL and LINE SEPARATOR all become LF. An entity such as `&#x2028;` is not raw text and stays as it is.
 * @param text raw XML
 * @returns XML with normalized line endings
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r[\n\u0085]/g, '\n').replace(/[\r\u0085\u2028]/g, '\n');
}

/**
 * Parses a whole XML part, calling back with each element's resolved name and its ancestors' names.
 * @param xml the part
 * @param open called at each start tag
 * @param close called at each end tag
 */
export function walkXml(
  xml: string,
  open: (
    name: string,
    attributes: Record<string, string>,
    ancestors: string[],
  ) => void,
  close: (name: string) => void = () => undefined,
): void {
  const names = new NameResolver();
  const ancestors: string[] = [];
  const parser = new Parser(
    {
      onopentag: (qname, qattributes) => {
        const { name, attributes } = names.open(qname, qattributes);
        open(name, attributes, ancestors);
        ancestors.push(name);
      },
      onclosetag: () => {
        names.close();
        close(ancestors.pop() ?? '');
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  parser.write(normalizeLineEndings(xml));
  parser.end();
}

/** One step of a parsed XML part, with names resolved by namespace */
export type XmlEvent =
  | { type: 'open'; name: string; attributes: Record<string, string> }
  | { type: 'text'; text: string }
  | { type: 'close' };

/**
 * A reader of XML events written as ordinary recursive code: `const event = yield` takes the next event, and
 * `yield* child()` hands the stream to another reader until it returns. A reader called for an element (after its
 * open event) consumes everything up to and including that element's close event.
 */
export type Reader<T> = Generator<undefined, T, XmlEvent>;

/**
 * Parses an XML part as it streams in and feeds it to a reader, so memory holds only the reader's state (the
 * elements open around the current one), never the part.
 * @param stream XML part as a byte stream
 * @param reader reader of the whole part; it gets a final close event when the part ends
 * @returns what the reader returns
 */
export async function streamXml<T>(
  stream: NodeJS.ReadableStream,
  reader: Reader<T>,
): Promise<T> {
  let result: IteratorResult<undefined, T> = reader.next();
  const send = (event: XmlEvent): void => {
    if (!result.done) result = reader.next(event);
  };
  const names = new NameResolver();
  // mammoth's XML reader keeps elements and text nodes only, so CDATA sections are not read
  let cdata = false;
  const parser = new Parser(
    {
      onopentag: (qname, qattributes) => {
        const { name, attributes } = names.open(qname, qattributes);
        send({ type: 'open', name, attributes });
      },
      ontext: (text) => {
        if (!cdata) send({ type: 'text', text });
      },
      oncdatastart: () => {
        cdata = true;
      },
      oncdataend: () => {
        cdata = false;
      },
      onclosetag: () => {
        names.close();
        send({ type: 'close' });
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  const decoder = new StringDecoder('utf8');
  // A CR at the end of a chunk may pair with a LF or NEL at the start of the next one
  let carry = '';
  const write = (text: string, last: boolean): void => {
    let xml = carry + text;
    carry = '';
    if (!last && xml.endsWith('\r')) {
      carry = '\r';
      xml = xml.slice(0, -1);
    }
    parser.write(normalizeLineEndings(xml));
  };
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => write(decoder.write(chunk), false));
    stream.on('end', () => {
      write(decoder.end(), true);
      parser.end();
      resolve();
    });
    stream.on('error', reject);
  });
  send({ type: 'close' });
  if (!result.done) throw new Error('XML reader did not finish');
  return result.value;
}

/**
 * Skips the rest of the current element.
 * @returns nothing
 */
export function* skip(): Reader<void> {
  for (let depth = 1; depth > 0; ) {
    const event = yield;
    if (event.type === 'open') depth++;
    else if (event.type === 'close') depth--;
  }
}

/**
 * Skips the rest of the current element and writes a fixed text for it.
 * @param value the text
 * @returns the text
 */
export function* constant(value: string): Reader<string> {
  yield* skip();
  return value;
}

/**
 * The text directly in the current element; child elements are skipped.
 * @returns the text
 */
export function* textContent(): Reader<string> {
  let value = '';
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type === 'text') value += event.text;
    else if (event.type === 'open') yield* skip();
  }
  return value;
}

/**
 * The w:val of the first child element of each given name; child elements are otherwise skipped.
 * @param names the names to look for
 * @returns w:val by name for the names present (undefined when that element has no w:val)
 */
export function* attributesOf(
  names: string[],
): Reader<Record<string, string | undefined>> {
  const found: Record<string, string | undefined> = {};
  for (let event = yield; event.type !== 'close'; event = yield) {
    if (event.type !== 'open') continue;
    if (names.includes(event.name) && !(event.name in found))
      found[event.name] = event.attributes['w:val'];
    yield* skip();
  }
  return found;
}

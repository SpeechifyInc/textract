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

/** What streamXml calls back with: resolved element names, text, and element ends */
export interface XmlHandler {
  onOpen: (name: string, attributes: Record<string, string>) => void;
  onText: (text: string) => void;
  onClose: () => void;
}

/**
 * Parses an XML part as it streams in, so only the handler's state is held in memory.
 * @param stream XML part as a byte stream
 * @param reader handler to feed
 */
export async function streamXml(
  stream: NodeJS.ReadableStream,
  reader: XmlHandler,
): Promise<void> {
  const names = new NameResolver();
  // mammoth's XML reader keeps elements and text nodes only, so CDATA sections are not read
  let cdata = false;
  const parser = new Parser(
    {
      onopentag: (qname, qattributes) => {
        const { name, attributes } = names.open(qname, qattributes);
        reader.onOpen(name, attributes);
      },
      ontext: (text) => {
        if (!cdata) reader.onText(text);
      },
      oncdatastart: () => {
        cdata = true;
      },
      oncdataend: () => {
        cdata = false;
      },
      onclosetag: () => {
        names.close();
        reader.onClose();
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
}

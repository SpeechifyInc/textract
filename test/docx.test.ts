import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import { extractFromFile } from '../lib/index.js';

const DIR = fileURLToPath(path.dirname(import.meta.url));
const MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Expected text is what textract 3.1.4 produced through mammoth.convertToHtml, so the streaming reader stays a
// drop-in replacement. docx-features.docx covers what mammoth special-cases: split runs, bookmarks, hyperlinks
// (element and field), fields, unknown wrappers (skipped with their text), tabs, line/page breaks, symbols,
// footnotes and endnotes, tracked changes (insertions, deletions, a deleted paragraph mark, a deleted row),
// comments, a checkbox content control, text boxes (VML fallback read, DrawingML choice not), images, header
// rows, nested tables, empty paragraphs and the header part (not read).
const FEATURES_TEXT =
  'Title with splitWords and & entities <x> Before bookmark insidegoback Link: clickhere .after Field link ' +
  'showntext tail Page field 7 Simple field end Custom after Tab after tab after brafter page nb­soft Symbol ' +
  'α done Footnote here [1] and endnote [2] and again [3] Kept inserted end Deleted mark parajoins this one ' +
  'Comment commented Checkbox: label Block sdt text Smart Paris Box follows same paragraph FALLBACK box text ' +
  'Image after image Vml image H1 H2 A1 A1 second Nested Cell B2 Last paragraph. The footnote body. Second note ' +
  'paragraph. Endnote text. The footnote body. Second note paragraph. ';

const FEATURES_LINES =
  'Title with splitWords and & entities <x>\nBefore bookmark insidegoback\nLink: clickhere .after\nField link ' +
  'showntext tail\nPage field 7\nSimple field end\nCustom after\nTab\nafter tab\nafter brafter page nb­soft\n' +
  'Symbol α done\nFootnote here [1] and endnote [2] and again [3]\nKept inserted end\nDeleted mark ' +
  'parajoins this one\nComment commented\nCheckbox: label\nBlock sdt text\nSmart Paris\nBox follows same ' +
  'paragraph\nFALLBACK box text\nImage after image\nVml image\nH1\nH2\nA1\nA1 second \nNested \nCell \nB2\n \n' +
  'Last paragraph.\nThe footnote body.\nSecond note paragraph. \nEndnote text. \nThe footnote body.\nSecond ' +
  'note paragraph. ';

const tempDir = mkdtempSync(path.join(tmpdir(), 'textract-docx-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
].join(' ');

/**
 * Writes a Word document.
 * @param name file name
 * @param body the w:body content, or null for a package without a document part
 * @param files other parts by path, such as word/_rels/document.xml.rels
 * @returns path of the written file
 */
async function writeDocument(
  name: string,
  body: string | null,
  files: Record<string, string> = {},
): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  if (body !== null) {
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document ${NAMESPACES}>${body}</w:document>`,
    );
  }
  for (const [partPath, content] of Object.entries(files))
    zip.file(partPath, content);
  const filePath = path.join(tempDir, name);
  writeFileSync(
    filePath,
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  return filePath;
}

const run = (text: string): string =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const paragraph = (text: string): string => `<w:p>${run(text)}</w:p>`;
const relationship = (id: string, type: string, target: string): string =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const relationships = (content: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${content}</Relationships>`;

/**
 * A Word document of `paragraphs` paragraphs of eight formatted runs each, like real Word output.
 * @param paragraphs number of paragraphs
 * @returns path of the written file
 */
async function writeLongDocument(paragraphs: number): Promise<string> {
  const formattedRun = (i: number): string =>
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri"/>${i % 3 === 0 ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr>` +
    `<w:t xml:space="preserve">word${i} </w:t></w:r>`;
  const longParagraph = `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${Array.from({ length: 8 }, (_, i) => formattedRun(i)).join('')}</w:p>`;
  return writeDocument(
    `long-${paragraphs}.docx`,
    `<w:body>${longParagraph.repeat(paragraphs)}</w:body>`,
  );
}

describe('docx', () => {
  it('will read the text mammoth read, and only that', async () => {
    const text = await extractFromFile(
      path.join(DIR, 'files', 'docx-features.docx'),
      MIME,
    );
    expect(text).toBe(FEATURES_TEXT);
  });

  it('will keep the line breaks mammoth kept', async () => {
    const text = await extractFromFile(
      path.join(DIR, 'files', 'docx-features.docx'),
      MIME,
      {
        preserveLineBreaks: true,
      },
    );
    expect(text).toBe(FEATURES_LINES);
  });

  it('will include image alt text only when asked', async () => {
    const file = path.join(DIR, 'files', 'images.docx');
    expect(await extractFromFile(file, MIME)).toBe(
      'Revenue grew in every region this quarter. The team shipped two releases. The chart repeats below. End of report.',
    );
    expect(await extractFromFile(file, MIME, { includeAltText: true })).toBe(
      'Revenue grew in every region this quarter. Quarterly chart The team shipped two releases. Team photo The chart repeats below. Quarterly chart Team photo End of report.',
    );
  });

  // Same 3.1.4 goldens, one fixture per group of rules: [default text, preserveLineBreaks text].
  it.each([
    [
      // prefixes resolved by namespace URI, Strict OOXML, elements in other namespaces skipped with their content
      'docx-prefixes.docx',
      'Custom prefix text. Default namespace text. Strict namespace text. after unknown. real run.',
      'Custom prefix text.\nDefault namespace text.\nStrict namespace text.\nafter unknown.\nreal run.',
    ],
    [
      // \r\n, \r, U+0085 and U+2028 in the raw XML become \n, a U+2028 character reference does not
      'docx-line-endings.docx',
      'line separator raw line separator entity carriage return and lone and next line tabs and double spaces',
      'line\nseparator raw\nline separator entity\ncarriage\nreturn and\nlone and\nnext line\ntabs\nand double spaces',
    ],
    [
      // a checkbox content control is recognised by namespace, not by the w14 prefix
      'docx-checkbox-prefix.docx',
      'Box: done',
      'Box: done',
    ],
    [
      // w:tblHeader marks a header row whatever its w:val, header cells get no spaces
      'docx-header-rows.docx',
      'Before H1 H2 H3 H4 B1 B2',
      'Before\nH1\nH2\nH3\nH4\nB1 \nB2',
    ],
    [
      // nested and skipped list levels, a numbered heading, only leading header rows, merged cells, a bookmark
      // between rows, adjacent links to one target, a hyperlink without a target, formatted and empty field
      // links, an image-only paragraph and a line break before a link
      'docx-structure.docx',
      'Lists follow bullet one bullet two nested ordered nested again deep jump back to top ordered top level six ' +
        'is a paragraph Numbered heading styled list item after an empty paragraph Tables follow H1 H2 H3 H4 B1 ' +
        'B2 late header cell merge start x y wide after bookmark z Links follow sametarget other end No ' +
        'target:plainafter Field: boldbold2 plain after Empty field:after After image Line broken link Last.',
      'Lists follow\nbullet one\nbullet two\nnested ordered\nnested again\ndeep jump\nback to top\nordered top\n' +
        'level six is a paragraph\nNumbered heading\nstyled list item\nafter an empty paragraph\nTables follow\n' +
        'H1\nH2\nH3\nH4\nB1 \nB2 \nlate header \ncell \nmerge start \nx \ny \nwide \nafter bookmark \nz\n' +
        'Links follow\nsametarget other end\nNo target:plainafter\nField: boldbold2 plain after\nEmpty ' +
        'field:after\nAfter image\nLine\nbroken link\nLast.',
    ],
  ])('will read %s as mammoth did', async (file, text, lines) => {
    const filePath = path.join(DIR, 'files', file);
    expect(await extractFromFile(filePath, MIME)).toBe(text);
    expect(
      await extractFromFile(filePath, MIME, { preserveLineBreaks: true }),
    ).toBe(lines);
  });

  it("will read a VML image's title as its alt text", async () => {
    // mammoth never resolved o:title and wrote "undefined" here; the title is the image's actual alt text
    const text = await extractFromFile(
      path.join(DIR, 'files', 'docx-features.docx'),
      MIME,
      {
        includeAltText: true,
      },
    );
    expect(text).toContain('Vml image vml title H1');
    expect(text).toContain('Image a red apple after image');
  });

  it('will merge links to one target across runs that write nothing', async () => {
    const link = (text: string): string =>
      `<w:hyperlink r:id="rIdA">${run(text)}</w:hyperlink>`;
    const file = await writeDocument(
      'links.docx',
      `<w:body><w:p>${run('pre ')}${link('a')}<w:r><w:rPr><w:b/></w:rPr></w:r>${link('b')}` +
        `<w:r><w:lastRenderedPageBreak/></w:r>${link('c')}<w:r><w:commentReference w:id="0"/></w:r>${link('d')}` +
        `${run('')}${link('e')}${run(' post')}</w:p></w:body>`,
      {
        'word/_rels/document.xml.rels': relationships(
          relationship('rIdA', 'hyperlink', 'https://a.test/'),
        ),
      },
    );
    expect(await extractFromFile(file, MIME)).toBe('pre abcde post');
  });

  it('will keep the text box of a paragraph whose mark is deleted', async () => {
    const file = await writeDocument(
      'deleted-mark.docx',
      `<w:body><w:p><w:pPr><w:rPr><w:del w:id="1" w:author="a" w:date="2020-01-01T00:00:00Z"/></w:rPr></w:pPr>` +
        `${run('first')}<w:r><w:pict><v:shape><v:textbox><w:txbxContent>${paragraph('box')}</w:txbxContent>` +
        `</v:textbox></v:shape></w:pict></w:r></w:p>${paragraph('second')}${paragraph('third')}</w:body>`,
    );
    expect(await extractFromFile(file, MIME)).toBe('firstsecond box third');
    expect(
      await extractFromFile(file, MIME, { preserveLineBreaks: true }),
    ).toBe('firstsecond\nbox\nthird');
  });

  // mammoth takes the first relationship target that exists and otherwise word/footnotes.xml; a reference inside a
  // note is numbered after the body's references
  it.each([
    ['no relationships part', undefined],
    [
      'a prefixed relationships part',
      '<?xml version="1.0" encoding="UTF-8"?><ns0:Relationships xmlns:ns0="http://schemas.openxmlformats.org/package/2006/relationships"><ns0:Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></ns0:Relationships>',
    ],
    [
      'single-quoted relationships',
      relationships(
        "<Relationship Id='rId3' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes' Target='footnotes.xml'/>",
      ),
    ],
    [
      'a target that does not exist',
      relationships(relationship('rId3', 'footnotes', 'gone.xml')),
    ],
    [
      'an absolute target',
      relationships(relationship('rId3', 'footnotes', '/word/footnotes.xml')),
    ],
  ])('will find the footnotes with %s', async (_, rels) => {
    const footnotes =
      '<?xml version="1.0" encoding="UTF-8"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:footnote w:id="1"><w:p>${run('note ')}<w:r><w:footnoteReference w:id="2"/></w:r></w:p></w:footnote>` +
      `<w:footnote w:id="2">${paragraph('nested')}</w:footnote></w:footnotes>`;
    const file = await writeDocument(
      'notes.docx',
      `<w:body><w:p>${run('x')}<w:r><w:footnoteReference w:id="1"/></w:r></w:p></w:body>`,
      {
        'word/footnotes.xml': footnotes,
        ...(rels ? { 'word/_rels/document.xml.rels': rels } : {}),
      },
    );
    expect(await extractFromFile(file, MIME)).toBe('x [1] note [2] ');
  });

  it('will count the pictures mammoth counts for alt text', async () => {
    const picture =
      '<pic:pic><pic:blipFill><a:blip r:embed="rIdI"/></pic:blipFill></pic:pic>';
    const drawing = (content: string): string =>
      `<w:r><w:drawing><wp:anchor><wp:docPr id="1" name="x" descr="picture"/><a:graphic><a:graphicData>${content}` +
      '</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
    const file = await writeDocument(
      'pictures.docx',
      `<w:body><w:p>${run('two:')}${drawing(picture + picture)}</w:p>` +
        `<w:p>${run('group:')}${drawing(`<wpg:wgp xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">${picture}</wpg:wgp>`)}</w:p>` +
        `<w:p>${run('no embed:')}${drawing('<pic:pic><pic:blipFill><a:blip/></pic:blipFill></pic:pic>')}</w:p></w:body>`,
      {
        'word/_rels/document.xml.rels': relationships(
          relationship('rIdI', 'image', 'media/i.png'),
        ),
        'word/media/i.png': 'x',
      },
    );
    expect(await extractFromFile(file, MIME, { includeAltText: true })).toBe(
      'two: picture picture group: no embed:',
    );
  });

  it('will read malformed and unusual markup as mammoth did', async () => {
    const file = await writeDocument(
      'unusual.docx',
      // a checkbox whose character sits in a nested control; a paragraph directly in a table; a CDATA section
      `<w:body><w:p><w:sdt><w:sdtPr><w14:checkbox/></w:sdtPr><w:sdtContent><w:sdt><w:sdtContent>${run('☐')}` +
        `</w:sdtContent></w:sdt>${run(' label')}</w:sdtContent></w:sdt></w:p>` +
        `<w:tbl>${paragraph('stray')}<w:tr><w:tc>${paragraph('cell')}</w:tc></w:tr></w:tbl>` +
        `<w:p>${run('text')}<w:r><w:t><![CDATA[cdata]]></w:t></w:r></w:p></w:body>`,
    );
    expect(
      await extractFromFile(file, MIME, { preserveLineBreaks: true }),
    ).toBe('label\nstray\ncell\ntext');
  });

  it('will fail on a package without a document part or body', async () => {
    await expect(
      extractFromFile(await writeDocument('no-part.docx', null), MIME),
    ).rejects.toThrow('Could not find main document part');
    await expect(
      extractFromFile(
        await writeDocument('no-body.docx', paragraph('x')),
        MIME,
      ),
    ).rejects.toThrow('Could not find the body element');
  });

  // mammoth built an object for every paragraph and run: this document needed ~3.7 GB of heap and took down the
  // 2 GB service worker reading it (PLA-12062). Streamed, it peaks at ~70 MB.
  it('will read a 50k-paragraph document', async () => {
    const text = await extractFromFile(await writeLongDocument(50_000), MIME);
    const words = text.split(' ').filter(Boolean);
    expect(words).toHaveLength(400_000);
    expect(words.slice(0, 3)).toEqual(['word0', 'word1', 'word2']);
    expect(words.at(-1)).toBe('word7');
  }, 60_000);
});

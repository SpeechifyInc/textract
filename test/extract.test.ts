import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mime from 'mime';
import { describe, it, expect } from 'vitest';
import { extract } from '../lib/index.js';
import type { Options } from '../lib/types.js';

const DIR = fileURLToPath(path.dirname(import.meta.url));

/**
 * Extract text from a file with a path
 * @param filePath path to file
 * @param options options
 * @returns text from file
 */
async function fromFileWithPath(filePath: string, options: Options = {}) {
  const mimeType = mime.getType(filePath) ?? '';
  const fileContent = fs.readFileSync(filePath);
  const text = await extract(mimeType, fileContent, options);
  return text;
}

describe('textract', () => {
  describe('for .csv files ', () => {
    // is some oddness testing html files, not sure what the deal is

    it('from csv files', async () => {
      const docPath = path.join(DIR, 'files', 'csv.csv');
      const text = await fromFileWithPath(docPath);
      expect(text.length).toEqual(18);
      expect(text).toEqual('Foo,Bar Foo2,Bar2 ');
    });

    it('it will extract text from csv files and insert newlines in the right places', async () => {
      const docPath = path.join(DIR, 'files', 'csv.csv');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.length).toEqual(18);
      expect(text).toEqual('Foo,Bar\nFoo2,Bar2\n');
    });
  });

  describe('for .html files', () => {
    // is some oddness testing html files, not sure what the deal is

    it('will extract text from html files and insert newlines in the right places', async () => {
      const docPath = path.join(DIR, 'files', 'test.html');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.length).toEqual(80);
      expect(text).toEqual(
        '\nThis is a\nlong string\nof text\nthat should get extracted\nwith new lines inserted',
      );
    });

    it('will extract text from html files', async () => {
      const docPath = path.join(DIR, 'files', 'Google.html');
      const text = await fromFileWithPath(docPath);
      expect(text.length).toEqual(869);
      expect(text.substring(565, 620)).toEqual(
        'you say next. Learn more No thanks Enable "Ok Google" I',
      );
    });

    it('will extract text from html files and preserve alt text when asked', async () => {
      const docPath = path.join(DIR, 'files', 'test-alt.html');
      const text = await fromFileWithPath(docPath, { includeAltText: true });
      expect(text.length).toEqual(46);
      expect(text).toEqual(' This is a paragraph that has an image inside ');
    });
  });

  describe('for .rss files', () => {
    it('will extract text from rss files', async () => {
      const docPath = path.join(DIR, 'files', 'rss.rss');
      const text = await fromFileWithPath(docPath);
      expect(text.length).toEqual(5399);
      expect(text.substring(0, 100)).toEqual(
        ' FeedForAll Sample Feed RSS is a fascinating technology. The uses for RSS are expanding daily. Take ',
      );
    });

    it('will extract text from rss files and preserve line breaks', async () => {
      const docPath = path.join(DIR, 'files', 'rss.rss');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.length).toEqual(5534);
      expect(text.substring(0, 100)).toEqual(
        '\n FeedForAll Sample Feed\n RSS is a fascinating technology. The uses for RSS are expanding daily. Tak',
      );
    });
  });

  describe('for .epub files', { timeout: 10_000 }, () => {
    it('will extract text from epub files', async () => {
      const docPath = path.join(DIR, 'files', 'Metamorphosis-jackson.epub');

      const text = await fromFileWithPath(docPath);
      expect(text.length).toEqual(119329);
      expect(text.substring(3000, 3500)).toEqual(
        'dboard so that he could lift his head better; found where the itch was, and saw that it was covered with lots of little white spots which he didn\'t know what to make of; and when he tried to feel the place with one of his legs he drew it quickly back because as soon as he touched it he was overcome by a cold shudder. He slid back into his former position. "Getting up early all the time", he thought, "it makes you stupid. You\'ve got to get enough sleep. Other travelling salesmen live a life of lu',
      );
    });

    it('will extract text from epub files and preserve line breaks', async () => {
      const docPath = path.join(DIR, 'files', 'Metamorphosis-jackson.epub');

      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.length).toEqual(119342);
      expect(text.substring(3000, 3500)).toEqual(
        'rds the headboard so that he could lift his head better; found where the itch was, and saw that it was covered with lots of little white spots which he didn\'t know what to make of; and when he tried to feel the place with one of his legs he drew it quickly back because as soon as he touched it he was overcome by a cold shudder.\nHe slid back into his former position. "Getting up early all the time", he thought, "it makes you stupid. You\'ve got to get enough sleep. Other travelling salesmen live a',
      );
    });
  });

  describe('for .atom files', () => {
    it('will extract text from atom files', async () => {
      const docPath = path.join(DIR, 'files', 'atom.atom');
      const text = await fromFileWithPath(docPath);
      expect(text.length).toEqual(26731);
      expect(text.substring(0, 100)).toEqual(
        ' @{}[]tag:theregister.co.uk,2005:feed/theregister.co.uk/data_centre/storage/ The Register - Data Cen',
      );
    });

    it('will extract text from atom files and preserve line breaks', async () => {
      const docPath = path.join(DIR, 'files', 'atom.atom');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.length).toEqual(27441);
      expect(text.substring(0, 100)).toEqual(
        '\n @{}[]tag:theregister.co.uk,2005:feed/theregister.co.uk/data_centre/storage/\n The Register - Data C',
      );
    });
  });

  describe('for .rtf files', () => {
    it('will extract text from rtf files', async () => {
      const docPath = path.join(DIR, 'files', 'sample.rtf');
      const text = await fromFileWithPath(docPath);
      expect(text.substring(144, 220)).toEqual(
        "So we're going to end this paragraph here and go on to a nice little list: I",
      );
    });

    it('will extract when there are spaces in the name', async () => {
      const docPath = path.join(DIR, 'files', 'sample rtf.rtf');
      const text = await fromFileWithPath(docPath);
      expect(text.substring(144, 220)).toEqual(
        "So we're going to end this paragraph here and go on to a nice little list: I",
      );
    });

    it('will extract text from actual rtf files with lines left in', async () => {
      const docPath = path.join(DIR, 'files', 'sample.rtf');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.substring(144, 227)).toEqual(
        "So we're going to end this paragraph here and go on to a nice little list:\n\n Item 1",
      );
    });
  });

  describe('for .doc files', () => {
    it('will extract text from actual doc files', async () => {
      const docPath = path.join(DIR, 'files', 'doc.doc');
      const text = await fromFileWithPath(docPath);
      expect(text.substring(0, 100)).toEqual(
        'Word Specification Sample Working Draft 04, 16 August 2002 Document identifier: wd-spectools-word-sa',
      );
    });

    it('will extract text from actual doc files with spaces in the name', async () => {
      const docPath = path.join(DIR, 'files', 'doc space.doc');
      const text = await fromFileWithPath(docPath);
      expect(text.substring(0, 100)).toEqual(
        'Word Specification Sample Working Draft 04, 16 August 2002 Document identifier: wd-spectools-word-sa',
      );
    });

    it('will not extract text from text files masquerading as doc files', async () => {
      try {
        const docPath = path.join(DIR, 'files', 'notadoc.doc');
        await fromFileWithPath(docPath);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          'does not appear to really be a .doc file',
        );
      }
    });

    it('will extract text from large .doc', async () => {
      const docPath = path.join(DIR, 'files', 'sample.doc');
      const text = await fromFileWithPath(docPath);
      expect(text.length).toBeGreaterThan(30_000);
    });

    it('will extract text preserving line breaks without word wrap', async () => {
      const docPath = path.join(DIR, 'files', 'multiple-long-paragraphs.doc');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.split(/[\r\n]+/g).length).toEqual(3);
    });
  });

  describe('for .xls files', () => {
    it('will extract text', async () => {
      const docPath = path.join(DIR, 'files', 'test.xls');
      const text = await fromFileWithPath(docPath);
      expect(text.substring(0, 20)).toEqual('This,is,a,spreadshee');
    });

    it('will extract text from multi-line files', async () => {
      const docPath = path.join(DIR, 'files', 'test-multiline.xls');
      const text = await fromFileWithPath(docPath);
      expect(text.substring(0, 40)).toEqual(
        'This,is,a,spreadsheet,yay! And ,this,is,',
      );
    });

    it('will extract text from multi-line files and keep line breaks', async () => {
      const docPath = path.join(DIR, 'files', 'test-multiline.xls');
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.substring(0, 40)).toEqual(
        'This,is,a,spreadsheet,yay!\nAnd ,this,is,',
      );
    });
  });

  describe('for .xlsx files', () => {
    it('will extract text and numbers from XLSX files', async () => {
      const filePath = path.join(DIR, 'files', 'pi.xlsx');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('This is the value of PI:,3.141592 ');
    });

    it('will extract text from XLSX files with multiple sheets', async () => {
      const filePath = path.join(DIR, 'files', 'xlsx.xlsx');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(49, 96)).toEqual(
        'Color,Pattern,Sex,GeneralSizePotential,GeneralA',
      );
    });

    it('will error when input file is not an actual xlsx file', async () => {
      const filePath = path.join(DIR, 'files', 'notaxlsx.xlsx');
      try {
        await fromFileWithPath(filePath);
      } catch (error) {
        expect((error as Error).message).toMatch(
          /Could not extract .* PRN files unsupported/,
        );
      }
    });
  });

  describe('for .pdf files', () => {
    it('will extract text from actual pdf files', async () => {
      const filePath = path.join(DIR, 'files', 'pdf.pdf');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('This is a test. Please ignore.');
    });

    it('will extract pdf text and preserve multiple lines', async () => {
      const filePath = path.join(DIR, 'files', 'testpdf-multiline.pdf');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });
      expect(text).toEqual(
        'This is a test,\nA multi-line test,\nLets hope it works',
      );
    });

    it("will error out when pdf file isn't actually a pdf", async () => {
      const filePath = path.join(DIR, 'files', 'notapdf.pdf');
      try {
        await fromFileWithPath(filePath);
      } catch (error) {
        expect((error as Error).message).toContain(
          'Error extracting PDF text for file',
        );
      }
    });

    it('will properly handle multiple columns', async () => {
      const filePath = path.join(DIR, 'files', 'two_columns.pdf');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });
      expect(
        text.indexOf(
          'Abstract— This work deals with a multi-cell topology based\non current-source converters based power cells.',
        ),
      ).toBeGreaterThan(500);
    });

    it('can handle files with spaces in the name', async () => {
      const filePath = path.join(DIR, 'files', 'two columns.pdf');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });
      expect(
        text.indexOf(
          'Abstract— This work deals with a multi-cell topology based\non current-source converters based power cells.',
        ),
      ).toBeGreaterThan(500);
    });

    it('can handle PDFs with passwords', async () => {
      const filePath = path.join(
        DIR,
        'files',
        'pdf-example-password.original.pdf',
      );
      const text = await fromFileWithPath(filePath, {
        pdftotextOptions: { userPassword: 'test' },
      });
      expect(text.substring(0, 200)).toEqual(
        'Backup4all –backup solution for network environments Starting from version 2 it is easier to install Backup4all in a network environment. Network administrators can install Backup4all on a single comp',
      );
    });

    it('can handle PDFs with full-width Japanese characters', async () => {
      const filePath = path.join(DIR, 'files', 'full-width-j.pdf');
      const text = await fromFileWithPath(filePath);
      expect(text.replace(/ /g, '').substring(2685, 2900)).toEqual(
        '＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝～｟｠｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟﾡﾢﾣﾤﾥﾦﾧﾨﾩﾪﾫﾬﾭﾮﾯﾰﾱﾲﾳﾴﾵﾶﾷﾸﾹﾺﾻﾼﾽﾾￂￃￄￅￆￇￊￋￌￍￎￏￒￓￔￕￖￗￚￛￜ￠￡￢￣￤￥￦F',
      );
    });

    // it( 'can handle arabic', function( done ) {
    //   var filePath = path.join( DIR, 'files', 'arabic.pdf' );
    //   fromFileWithPath( filePath, function( error, text ) {
    //     expect( error ).to.be.null;
    //     expect( text ).to.be.a( 'string' );
    //     expect( text.substring( 0, 200 ) ).to.eql( '' );
    //     done();
    //   });
    // });
  });

  describe('for .docx files', () => {
    it('will extract text from actual docx files', async () => {
      const filePath = path.join(DIR, 'files', 'docx.docx');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 20)).toEqual('This is a test Just ');
    });

    it('will extract text from actual docx files and preserve line breaks', async () => {
      const filePath = path.join(DIR, 'files', 'docx.docx');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });
      expect(text.substring(20, 40)).toEqual('so you know:\nLorem i');
    });

    it('will extract text from actual docx files and preserve line breaks [line-breaks.docx]', async () => {
      const filePath = path.join(DIR, 'files', 'line-breaks.docx');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });
      expect(text).toEqual(
        'Paragraph follows\n\nLine break follows\n\nend\n\n',
      );
    });

    it("will error out when docx file isn't actually a docx", async () => {
      const filePath = path.join(DIR, 'files', 'notadocx.docx');
      try {
        await fromFileWithPath(filePath);
      } catch (error) {
        expect((error as Error).message).toContain(
          'File not correctly recognized as zip file',
        );
      }
    });

    it('will not extract smashed together text', async () => {
      const filePath = path.join(DIR, 'files', 'testresume.docx');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 31)).toEqual('Karol Miner 336 W. Chugalug Way');
    });

    it('can handle funky formatting', async () => {
      const filePath = path.join(DIR, 'files', 'Untitleddocument.docx');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual(
        "this is a test document that won't be extracted properly. ",
      );
    });

    it('can handle a huge docx', async () => {
      const filePath = path.join(DIR, 'files', 'LargeLorem.docx');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 100)).toEqual(
        'Hashtag chambray XOXO PBR&B chia small batch. Before they sold out banh mi raw denim, fap synth hell',
      );
    });

    it('can handle arabic', async () => {
      const filePath = path.join(DIR, 'files', 'arabic.docx');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 100)).toEqual(
        ' التعرف الضوئي على الحروف إشعار عدم التمييز (المصدر: مكتب الصحة والخدمات الإنسانية من أجل الحقوق الم',
      );
    });
  });

  describe('for text/* files', () => {
    it('will extract text from specifically a .txt file', async () => {
      const filePath = path.join(DIR, 'files', 'txt.txt');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('This is a plain old text file.');
    });

    it('will extract text from specifically a non utf8 .txt file', async () => {
      const filePath = path.join(DIR, 'files', 'non-utf8.txt');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('これは非UTF8 テキストファイルです ');
    });

    it('will error when .txt file encoding cannot be detected', async () => {
      const filePath = path.join(DIR, 'files', 'unknown-encoding.txt');
      try {
        await fromFileWithPath(filePath);
      } catch (error) {
        expect((error as Error).message).toMatch(
          /Could not detect encoding for file named \[\[ .* \]\]/,
        );
      }
    });

    it('will extract text specifically from a .css file', async () => {
      const filePath = path.join(DIR, 'files', 'css.css');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('.foo {color:red}');
    });

    it('will extract text specifically from a .js file', async () => {
      const filePath = path.join(DIR, 'files', 'js.js');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual("console.log('javascript is cooler than you'); ");
    });

    it('will remove extraneous white space from a .txt file', async () => {
      const filePath = path.join(DIR, 'files', 'spacey.txt');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('this has lots of space');
    });

    it('will not remove fancy quotes from a .txt file', async () => {
      const filePath = path.join(DIR, 'files', 'fancyquote.txt');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('this has "fancy" quotes');
    });
  });

  describe('for .dxf files', () => {
    it('will extract text from actual dxf files', async () => {
      const filePath = path.join(DIR, 'files', 'dxf.dxf');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual(
        ' PART: FILE: {\fTimes New Roman|b0|i0|c0|p18;(800) 433-1119} {\fTimes New Roman|b0|i0|c0|p18;Barium Springs, NC 28010} {\fTimes New Roman|b0|i0|c0|p18;MultiDrain Systems, Inc.} {\fTimes New Roman|b0|i0|c0|p18;Manufacturers of MultiDrain & EconoDrain } to others for manufacturing or for any other purpose except as specifically authorized in writing by MultiDrain Systems, Inc. Proprietary rights of MultiDrain Systems, Inc. are included in the information disclosed herein. The recipient, by accepting this document, agrees that neither this document nor the information disclosed herein nor any part thereof shall be copied, reproduced or transferred 0 2" 4" 6" 8" 12" 16" GRAPHIC SCALE BAR A1;T A1;T A1;T A1;6.1" 155mm A1;T A1;T A1;4.9" 124mm A1;19.6" 497mm FRAME AND GRATE LENGTH A1;5.5" 140mm %%UCROSS SECTIONAL VIEW SOIL SUBGRADE CONCRETE THICKNESS AND REINFORCEMENT PER STRUCTURAL ENGINEER S SPECIFICATION FOR THE APPLICATION FLOOR SLAB THICKNESS, OR 4" MIN. [100mm], OR SPECIFICATION (WHICHEVER IS GREATER) T = MONOLITHIC CONCRETE POUR (ACCEPTABLE) EXPANSION JOINT BOTH SIDES (PREFERRED) LOCK DOWN BOLT LOCK TOGGLE ANCHOR BOLT SEE ABOVE FOR ACTUAL FRAME & GRATE SECTIONS %%UPLAN %%USECTION 512AF %%UPLAN %%USECTION 513AF 514AF %%UPLAN %%USECTION 515AF %%UPLAN %%USECTION ANCHOR RIB INDEPENDENTLY ANCHORED FRAME ALFA CHANNEL A1;502 GRATE 510AF ANCHOR FRAME 503 GRATE 510AF ANCHOR FRAME 504 GRATE 505 GRATE FRAME AND GRATE ADD 1.2" [31mm] TO OVERALL DEPTH OF CHANNEL LNOTE: GRATE WIDTH FRAME WIDTH AC-2510AF-00 2512AF 2513AF 2514AF 2515AF ALFA CHANNEL SYSTEM DUCTILE IRON FRAME & GRATES PRODUCT DRAWING 2006 MultiDrain Systems, Inc. ',
      );
    });

    it('will error when input file is not an actual dxf file', async () => {
      const filePath = path.join(DIR, 'files', 'notadxf.dxf');
      try {
        await fromFileWithPath(filePath);
      } catch (error) {
        expect((error as Error).message).toEqual(
          'Error for type: [[ image/vnd.dxf ]], file: notadxf.dxf',
        );
      }
    });
  });

  describe('for .pptx files', () => {
    it('will extract text PPTX files', async () => {
      const filePath = path.join(DIR, 'files', 'ppt.pptx');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(55, 96)).toEqual(
        'ullet 1 Bullet 2 Bullet 3 Number 1 Number',
      );
    });

    it('will extract text PPTX files with notes', async () => {
      const filePath = path.join(DIR, 'files', 'PrezoWithNotes.pptx');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('This is a slide These are speaker notes 1 ');
    });

    it('will extract slides in the right order', async () => {
      const filePath = path.join(DIR, 'files', 'order.pptx');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });

      const lines = text.split('\n').filter((line) => /^Slide/.exec(line));

      const expectedLines = [
        'Slide 1 Title',
        'Slide 1 Subtitle',
        'Slide 2: Title and Content',
        'Slide 3: Section header',
        'Slide 4: Two-Content',
        'Slide 5: Comparison',
        'Slide 8: Content w/Caption',
        'Slide 9: picture with caption',
        'Slide 10: Vertical Text',
        'Slide 11: Vertical Title and text',
      ];

      expect(lines).to.eql(expectedLines);
    });

    it('will keep preserved characters', async () => {
      const filePath = path.join(DIR, 'files', 'order.pptx');
      const text = await fromFileWithPath(filePath, {
        preserveLineBreaks: true,
      });
      expect(text.indexOf('…')).toEqual(928);
    });
  });

  describe('for odt files', () => {
    it('will extract text from ODT files', async () => {
      const filePath = path.join(DIR, 'files', 'spaced.odt');
      const text = await fromFileWithPath(filePath);
      expect(text).toEqual('This Is some text');
    });
  });

  describe('for image files', () => {
    it('will extract text from PNG files', async () => {
      const filePath = path.join(DIR, 'files', 'testphoto.png');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 100)).toEqual(
        'performance measure against standards and targets is increasingly used in the management of complex ',
      );
    });

    it('will extract text from JPG files', async () => {
      const filePath = path.join(DIR, 'files', 'testphoto.jpg');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 100)).toEqual(
        'performance measure against standards and targets is increasingly used in the management of complex ',
      );
    });

    it('will extract text from GIF files', async () => {
      const filePath = path.join(DIR, 'files', 'testphoto.gif');
      const text = await fromFileWithPath(filePath);
      expect(text.substring(0, 100)).toEqual(
        'performance measure against standards and targets is increasingly used in the management of complex ',
      );
    });

    // sudo port install tesseract-chi-sim
    it(
      'will extract text from language-d files',
      { timeout: 5000 },
      async () => {
        const filePath = path.join(DIR, 'files', 'chi.png');
        const text = await fromFileWithPath(filePath, {
          tesseract: { lang: 'chi_sim' },
        });
        expect(text.substring(0, 6)).toEqual('卧虎藏龙，卧');
      },
    );

    // sudo port install tesseract-eng
    it('will take tesseract.cmd option', { timeout: 5000 }, async () => {
      const filePath = path.join(DIR, 'files', 'testpng.png');
      const text = await fromFileWithPath(filePath, {
        tesseract: { cmd: '-l eng --psm 3' },
      });
      expect(text.substring(0, 100)).toEqual(
        'The (quick) [brown] {fox} jumps! Over the $43,456.78 <lazy> #90 dog & duck/goose, as 12.5% of E-mail',
      );
    });
  });
});

const TEST_CASES = [
  [
    'markdown',
    'test.md',
    ' This is an h1 This is an h2 This text has been bolded and italicized ',
    '\nThis is an h1\nThis is an h2\nThis text has been bolded and italicized\n',
  ],

  [
    'ods',
    'ods.ods',
    'This,is,a,ods Really,it,is, I,promise,, ',
    'This,is,a,ods\nReally,it,is,\nI,promise,,\n',
  ],

  [
    'xml',
    'xml.xml',
    ' Empire Burlesque Bob Dylan USA Columbia 10.90 1985 Hide your heart Bonnie Tyler UK CBS Records 9.90',
    '\nEmpire Burlesque\nBob Dylan\nUSA\nColumbia\n10.90\n1985\nHide your heart\nBonnie Tyler\nUK\nCBS Records\n9.90',
  ],

  [
    'odt',
    'odt.odt',
    'This is an ODT THIS IS A HEADING More ODT',
    'This is an ODT\nTHIS IS A HEADING\nMore ODT',
  ],

  [
    'potx',
    'potx.potx',
    'This is a potx template Yep, a potx I had no idea These were even a thing ',
    'This is a potx template\nYep, a potx\nI had no idea \nThese were even a thing\n',
  ],

  [
    'xltx',
    'xltx.xltx',
    ',,,,,, Packing Slip ,Your Company Name,,,,"July 24, 2015", , Your Company Slogan,,,,, ,,,,,, ,Addres',
    ',,,,,, Packing Slip\n,Your Company Name,,,,"July 24, 2015",\n, Your Company Slogan,,,,,\n,,,,,,\n,Addres',
  ],

  [
    'ott',
    'ott.ott',
    'This is a document template, yay templates! Woo templates get me so excited!',
    'This is a document template, yay templates!\nWoo templates get me so excited!',
  ],

  [
    'ots',
    'ots.ots',
    "This,is , template, an,open,office,template isn't,it,awesome?, you,know,it,is ",
    "This,is , template,\nan,open,office,template\nisn't,it,awesome?,\nyou,know,it,is\n",
  ],

  [
    'odg',
    'odg.odg',
    "This is a drawing? A drawing, a drawing! This is a drawing, Aren't you mad envious?",
    "This is a drawing?\nA drawing, a drawing!\nThis is a drawing,\nAren't you mad envious?",
  ],

  [
    'otg',
    'otg.otg',
    'This is a drawing template A drawing template. Who would really ever need to extract from one of the',
    'This is a drawing template\nA drawing template.\nWho would really ever need to extract from one of the',
  ],

  [
    'odp',
    'odp.odp',
    "This is a title This is a slide's text This is a 2nd page And a 2nd page's content",
    "This is a title\nThis is a slide's text\nThis is a 2nd page\nAnd a 2nd page's content",
  ],

  [
    'otp',
    'otp.otp',
    'This is a template title Template page text 2nd prezo text',
    'This is a template title\nTemplate page text\n2nd prezo text',
  ],
] as const;

describe('textract', () => {
  it.each(TEST_CASES)(
    'for %s files will extract text',
    async (_ext, name, expectedText) => {
      const docPath = path.join(DIR, 'files', name);
      const text = await fromFileWithPath(docPath);
      expect(text.substring(0, 100)).toEqual(expectedText);
    },
  );

  it.each(TEST_CASES)(
    'for %s files will extract text and preserve line breaks',
    async (_ext, name, _expectedText, expectedTextWithLineBreaks) => {
      const docPath = path.join(DIR, 'files', name);
      const text = await fromFileWithPath(docPath, {
        preserveLineBreaks: true,
      });
      expect(text.substring(0, 100)).toEqual(expectedTextWithLineBreaks);
    },
  );
});

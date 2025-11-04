import { DOMParser as Dom } from 'xmldom';
import xpath from 'xpath';
import type yauzl from 'yauzl';
import type { Options } from '../types.js';
import util from '../util.js';

/**
 * Compare two slides by their slide number
 * @param a first slide
 * @param a.slide slide number of first slide
 * @param b second slide
 * @param b.slide slide number of second slide
 * @returns -1 if a is less than b, 1 if a is greater than b, 0 if a is equal to b
 */
function compareSlides(a: { slide: number }, b: { slide: number }) {
  if (a.slide < b.slide) {
    return -1;
  }
  if (a.slide > b.slide) {
    return 1;
  }
  return 0;
}

/**
 * Calculate extracted text from a slide text
 * @param slideText slide text
 * @returns extracted text
 */
function calculateExtractedText(slideText: string) {
  let doc = new Dom().parseFromString(slideText);
  const ps = xpath.select("//*[local-name()='p']", doc);
  let text = '';

  for (const paragraph of ps) {
    const paragraphElement = new Dom().parseFromString(paragraph.toString());
    const ts = xpath.select(
      "//*[local-name()='t' or local-name()='tab' or local-name()='br']",
      paragraphElement,
    );

    let localText = '';

    for (const t of ts) {
      if (t.localName === 't' && t.childNodes.length > 0) {
        localText += t.childNodes[0].data;
      } else if (t.localName === 'tab' || t.localName === 'br') {
        localText += '';
      }
    }

    text += `${localText}\n`;
  }

  return text;
}

/**
 * Extract text from a PPTX file
 * @param filePath path to file
 * @param _options options (not used)
 * @returns extracted text
 */
async function extractText(
  filePath: string,
  _options: Options,
): Promise<string> {
  const slides: { slide: number; text: string }[] = [];

  const zipfile = await util.unpackZipFile(filePath);
  return new Promise((resolve, reject) => {
    zipfile.on('error', (errInner: Error) => {
      reject(errInner);
    });

    zipfile.on('end', () => {
      if (slides.length) {
        slides.sort(compareSlides);
        const slidesText = slides.map((slide) => slide.text).join('\n');
        const text = calculateExtractedText(slidesText);
        resolve(text);
        return;
      }

      reject(
        new Error(
          'Extraction could not find slides in file, are you' +
            ' sure it is the mime type it says it is?',
        ),
      );
    });

    const processEntry = async (entry: yauzl.Entry) => {
      if (
        entry.fileName.startsWith('ppt/slides/slide') ||
        entry.fileName.startsWith('ppt/notesSlides/notesSlide')
      ) {
        try {
          const text = await util.getTextFromZipFile(zipfile, entry);
          const slide = Number(
            entry.fileName.replace('ppt/slides/slide', '').replace('.xml', ''),
          );
          slides.push({ slide, text });
        } catch (errInner) {
          reject(errInner as Error);
        }
      }
    };

    zipfile.on('entry', (entry: yauzl.Entry) => {
      void processEntry(entry);
    });
  });
}

export default {
  types: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.template',
  ],
  extract: extractText,
};

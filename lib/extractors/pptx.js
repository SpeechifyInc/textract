var xpath = require('xpath'),
  Dom = require('xmldom').DOMParser,
  yauzl = require('yauzl'),
  util = require('../util'),
  slideMatch = /^ppt\/slides\/slide/,
  noteMatch = /^ppt\/notesSlides\/notesSlide/;

/**
 *
 * @param a
 * @param b
 */
function _compareSlides(a, b) {
  if (a.slide < b.slide) {
    return -1;
  }
  if (a.slide > b.slide) {
    return 1;
  }
  return 0;
}

/**
 *
 * @param slideText
 */
function _calculateExtractedText(slideText) {
  let doc = new Dom().parseFromString(slideText),
    ps = xpath.select("//*[local-name()='p']", doc),
    text = '';
  ps.forEach((paragraph) => {
    let ts,
      localText = '';
    paragraph = new Dom().parseFromString(paragraph.toString());
    ts = xpath.select(
      "//*[local-name()='t' or local-name()='tab' or local-name()='br']",
      paragraph,
    );
    ts.forEach((t) => {
      if (t.localName === 't' && t.childNodes.length > 0) {
        localText += t.childNodes[0].data;
      } else if (t.localName === 'tab' || t.localName === 'br') {
          localText += '';
        }
    });
    text += `${localText  }\n`;
  });

  return text;
}

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function extractText(filePath, options, cb) {
  const slides = [];

  yauzl.open(filePath, (err, zipfile) => {
    if (err) {
      util.yauzlError(err, cb);
      return;
    }

    zipfile.on('end', () => {
      let slidesText, text;
      if (slides.length) {
        slides.sort(_compareSlides);
        slidesText = slides
          .map((slide) => slide.text)
          .join('\n');
        text = _calculateExtractedText(slidesText);
        cb(null, text);
      } else {
        cb(
          new Error(
            'Extraction could not find slides in file, are you' +
              ' sure it is the mime type it says it is?',
          ),
          null,
        );
      }
    });

    zipfile.on('entry', (entry) => {
      if (entry.fileName.startsWith("ppt/slides/slide") || entry.fileName.startsWith("ppt/notesSlides/notesSlide")) {
        util.getTextFromZipFile(zipfile, entry, (err2, text) => {
          const slide = +entry.fileName
            .replace('ppt/slides/slide', '')
            .replace('.xml', '');
          slides.push({ slide, text });
        });
      }
    });

    zipfile.on('error', (err3) => {
      cb(err3);
    });
  });
}

module.exports = {
  types: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.template',
  ],
  extract: extractText,
};

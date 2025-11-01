var fs = require('node:fs'),
  path = require('node:path'),
  {XmlEntities} = require('html-entities'),
  util = require('./util'),
  extractorPath = path.join(__dirname, 'extractors'),
  entities = new XmlEntities(),
  typeExtractors = {},
  regexExtractors = [],
  failedExtractorTypes = {},
  totalExtractors = 0,
  satisfiedExtractors = 0,
  hasInitialized = false,
  STRIP_ONLY_SINGLE_LINEBREAKS = /(^|[^\n])\n(?!\n)/g,
  WHITELIST_PRESERVE_LINEBREAKS =
    /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~'-\w\n\r]*/g,  
  WHITELIST_STRIP_LINEBREAKS =
    /[^A-Za-z\x80-\xFF\x24\u20AC\xA3\xA5 0-9 \u2015\u2116\u2018\u2019\u201C|\u201D\u2026 \uFF0C \u2013 \u2014 \u00C0-\u1FFF \u2C00-\uD7FF \uFB50–\uFDFF \uFE70–\uFEFF \uFF01-\uFFE6 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~'-\w]*/g;
  
/**
 *
 * @param extractor
 */
function registerExtractor(extractor) {
  if (extractor.types) {
    extractor.types.forEach((type) => {
      if (typeof type === 'string') {
        type = type.toLowerCase();
        typeExtractors[type] = extractor.extract;
      } else if (type instanceof RegExp) {
          regexExtractors.push({ reg: type, extractor: extractor.extract });
        }
    });
  }
}

/**
 *
 * @param extractor
 * @param failedMessage
 */
function registerFailedExtractor(extractor, failedMessage) {
  if (extractor.types) {
    extractor.types.forEach((type) => {
      failedExtractorTypes[type.toLowerCase()] = failedMessage;
    });
  }
}

/**
 *
 * @param extractor
 * @param options
 */
function testExtractor(extractor, options) {
  extractor.test(options, (passedTest, failedMessage) => {
    satisfiedExtractors++;
    if (passedTest) {
      registerExtractor(extractor);
    } else {
      registerFailedExtractor(extractor, failedMessage);
    }
  });
}

// global, all file type, content cleansing
/**
 *
 * @param options
 * @param cb
 */
function cleanseText(options, cb) {
  return function (error, text) {
    if (!error) {
      // clean up text
      text = util.replaceBadCharacters(text);

      if (
        options.preserveLineBreaks ||
        options.preserveOnlyMultipleLineBreaks
      ) {
        if (options.preserveOnlyMultipleLineBreaks) {
          text = text.replace(STRIP_ONLY_SINGLE_LINEBREAKS, '$1 ').trim();
        }
        text = text.replace(WHITELIST_PRESERVE_LINEBREAKS, ' ');
      } else {
        text = text.replace(WHITELIST_STRIP_LINEBREAKS, ' ');
      }

      // multiple spaces, tabs, vertical tabs, non-breaking space]
      text = text.replace(/ (?! )/g, '').replace(/[ \t\v\u00A0]{2,}/g, ' ');

      text = entities.decode(text);
    }
    cb(error, text);
  };
}

/**
 *
 * @param options
 */
function initializeExtractors(options) {
  let extractors;

  hasInitialized = true;

  // discover available extractors
  extractors = fs.readdirSync(extractorPath).map((item) => {
    const fullExtractorPath = path.join(extractorPath, item);
    // get the extractor
     
    return require(fullExtractorPath);
  });

  // perform any binary tests to ensure extractor is possible
  // given execution environment
  extractors.forEach((extractor) => {
    if (extractor.test) {
      testExtractor(extractor, options);
    } else {
      satisfiedExtractors++;
      registerExtractor(extractor);
    }
  });

  // need to keep track of how many extractors we have in total
  totalExtractors = extractors.length;
}

/**
 *
 * @param type
 */
function findExtractor(type) {
  let i,
    iLen = regexExtractors.length,
    extractor,
    regexExtractor;

  type = type.toLowerCase();
  if (typeExtractors[type]) {
    extractor = typeExtractors[type];
  } else {
    for (i = 0; i < iLen; i++) {
      regexExtractor = regexExtractors[i];
      if (type.match(regexExtractor.reg)) {
        extractor = regexExtractor.extractor;
      }
    }
  }
  return extractor;
}

/**
 *
 * @param type
 * @param filePath
 * @param options
 * @param cb
 */
function extract(type, filePath, options, cb) {
  let error, msg, theExtractor;

  if (!hasInitialized) {
    initializeExtractors(options);
  }

  // registration of extractors complete?
  if (totalExtractors === satisfiedExtractors) {
    theExtractor = findExtractor(type);

    if (theExtractor) {
      cb = cleanseText(options, cb);
      theExtractor(filePath, options, cb);
    } else {
      // cannot extract this file type
      msg = `Error for type: [[ ${  type  } ]], file: [[ ${  filePath  } ]]`;

      // update error message if type is supported but just not configured/installed properly
      if (failedExtractorTypes[type]) {
        msg +=
          `, extractor for type exists, but failed to initialize.` +
          ` Message: ${ 
          failedExtractorTypes[type]}`;
      }

      error = new Error(msg);
      error.typeNotFound = true;
      cb(error, null);
    }
  } else {
    // async registration has not wrapped up
    // try again later
    setTimeout(() => {
      extract(type, filePath, options, cb);
    }, 100);
  }
}

module.exports = extract;

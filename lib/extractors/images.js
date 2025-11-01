var {exec} = require('node:child_process'),
  util = require('../util');

/**
 *
 * @param options
 * @param inputFile
 * @param outputFile
 */
function tesseractExtractionCommand(options, inputFile, outputFile) {
  let cmd = `tesseract ${  inputFile  } ${  outputFile}`;
  if (options.tesseract) {
    if (options.tesseract.lang) {
      cmd += ` -l ${  options.tesseract.lang}`;
    } else if (options.tesseract.cmd) {
      cmd += ` ${  options.tesseract.cmd}`;
    }
  }
  cmd += ' quiet';
  return cmd;
}

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function extractText(filePath, options, cb) {
  const execOptions = util.createExecOptions('images', options);
  util.runExecIntoFile(
    'tesseract',
    filePath,
    options,
    execOptions,
    tesseractExtractionCommand,
    cb,
  );
}

/**
 *
 * @param options
 * @param cb
 */
function testForBinary(options, cb) {
  exec('tesseract', (error, stdout, stderr) => {
    let msg;
    // checking for content of help text
    if (
      (error && error.toString().includes('Usage:')) ||
      (stderr && stderr.toString().includes('Usage:')) ||
      (stdout && stdout.toString().includes('Usage:'))
    ) {
      cb(true);
    } else {
      msg =
        "INFO: 'tesseract' does not appear to be installed, " +
        'so textract will be unable to extract images.';
      cb(false, msg);
    }
  });
}

module.exports = {
  types: ['image/png', 'image/jpeg', 'image/gif'],
  extract: extractText,
  test: testForBinary,
};

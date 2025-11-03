import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import util from '../util.js';

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function extractText(filePath, options, cb) {
  const execOptions = util.createExecOptions('doc', options);

  exec(
    `antiword -m UTF-8.txt "${filePath}"`,
    execOptions,
    (error, stdout /* , stderr */) => {
      let err;
      if (error) {
        if (error.toString().indexOf('is not a Word Document') > 0) {
          err = new Error(
            `file named [[ ${path.basename(
              filePath,
            )} ]] does not appear to really be a .doc file`,
          );
        } else {
          err = new Error(
            `antiword read of file named [[ ${path.basename(
              filePath,
            )} ]] failed: ${error}`,
          );
        }
        cb(err, null);
      } else {
        cb(null, stdout.trim().replace(/\[pic\]/g, ''));
      }
    },
  );
}

/**
 *
 * @param options
 * @param cb
 */
function testForBinary(options, cb) {
  let execOptions;

  // just non-osx extractor
  if (os.platform() === 'darwin') {
    cb(true);
    return;
  }

  execOptions = util.createExecOptions('doc', options);

  exec(
    `antiword -m UTF-8.txt ${__filename}`,
    execOptions,
    (error /* , stdout, stderr */) => {
      let msg;
      if (
        error !== null &&
        error.message &&
        error.message.includes('not found')
      ) {
        msg =
          "INFO: 'antiword' does not appear to be installed, " +
          'so textract will be unable to extract DOCs.';
        cb(false, msg);
      } else {
        cb(true);
      }
    },
  );
}

export default {
  // let textutil handle .doc on osx
  types: os.platform() === 'darwin' ? [] : ['application/msword'],
  extract: extractText,
  test: testForBinary,
};

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import got from 'got';
import mime from 'mime';
import extract from './extract.js';

const tmpDir = os.tmpdir();

/**
 *
 */
function _genRandom() {
  return Math.floor(Math.random() * 100000000000 + 1);
}

/**
 *
 * @param type
 * @param filePath
 * @param options
 * @param cb
 */
function _extractWithType(type, filePath, options, cb) {
  fs.exists(filePath, (exists) => {
    if (exists) {
      extract(type, filePath, options, cb);
    } else {
      cb(new Error(`File at path [[ ${filePath} ]] does not exist.`), null);
    }
  });
}

/**
 *
 * @param _args
 */
function _returnArgsError(_args) {
  let args = Array.prototype.slice.call(_args),
    callback;

  args.forEach((parm) => {
    if (parm && typeof parm === 'function') {
      callback = parm;
    }
  });

  if (callback) {
    callback(new Error('Incorrect parameters passed to textract.'), null);
  } else {
    console.error('textract could not find a callback function to execute.');
  }
}

/**
 *
 * @param buff
 * @param cb
 */
function _writeBufferToDisk(buff, cb) {
  const fullPath = path.join(tmpDir, `textract_file_${_genRandom()}`);

  fs.open(fullPath, 'w', (err, fd) => {
    if (err) {
      throw new Error(`error opening temp file: ${err}`);
    } else {
      fs.write(fd, buff, 0, buff.length, null, (err2) => {
        if (err2) {
          throw new Error(`error writing temp file: ${err2}`);
        } else {
          fs.close(fd, () => {
            cb(fullPath);
          });
        }
      });
    }
  });
}

/**
 *
 * @param type
 * @param filePath
 * @param options
 * @param cb
 */
function fromFileWithMimeAndPath(type, filePath, options, cb) {
  let called = false;

  if (typeof type === 'string' && typeof filePath === 'string') {
    if (typeof cb === 'function' && typeof options === 'object') {
      // (mimeType, filePath, options, callback)
      _extractWithType(type, filePath, options, cb);
      called = true;
    } else if (typeof options === 'function' && cb === undefined) {
      // (mimeType, filePath, callback)
      _extractWithType(type, filePath, {}, options);
      called = true;
    }
  }

  if (!called) {
    _returnArgsError(arguments);
  }
}

/**
 *
 * @param filePath
 * @param options
 * @param cb
 */
function fromFileWithPath(filePath, options, cb) {
  let type;
  if (
    typeof filePath === 'string' &&
    (typeof options === 'function' || typeof cb === 'function')
  ) {
    type = options?.typeOverride || mime.getType(filePath);
    fromFileWithMimeAndPath(type, filePath, options, cb);
  } else {
    _returnArgsError(arguments);
  }
}

/**
 *
 * @param type
 * @param bufferContent
 * @param options
 * @param cb
 * @param withPath
 */
function fromBufferWithMime(type, bufferContent, options, cb, withPath) {
  if (
    typeof type === 'string' &&
    bufferContent &&
    bufferContent instanceof Buffer &&
    (typeof options === 'function' || typeof cb === 'function')
  ) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    _writeBufferToDisk(bufferContent, (newPath) => {
      fromFileWithMimeAndPath(type, newPath, options, (err, text) => {
        // Remove temporary file regardless of error, ignore error on unlink
        fs.unlink(newPath, () => {});
        if (cb) cb(err, text);
      });
    });
  } else {
    _returnArgsError(arguments);
  }
}

/**
 *
 * @param filePath
 * @param bufferContent
 * @param options
 * @param cb
 */
function fromBufferWithName(filePath, bufferContent, options, cb) {
  let type;
  if (typeof filePath === 'string') {
    type = mime.getType(filePath);
    fromBufferWithMime(type, bufferContent, options, cb, true);
  } else {
    _returnArgsError(arguments);
  }
}

/**
 *
 * @param url
 * @param options
 * @param cb
 */
function fromUrl(url, options, cb) {
  let urlNoQueryParams,
    extname,
    filePath,
    fullFilePath,
    file,
    href,
    callbackCalled;

  // allow url to be either a string or to be a
  // Node URL Object: https://nodejs.org/api/url.html
  href = typeof url === 'string' ? url : url.href;

  if (href) {
    options ||= {};
    urlNoQueryParams = href.split('?')[0];
    extname = path.extname(urlNoQueryParams);
    filePath = _genRandom() + extname;
    fullFilePath = path.join(tmpDir, filePath);
    file = fs.createWriteStream(fullFilePath);
    file.on('finish', () => {
      if (!callbackCalled) {
        fromFileWithPath(fullFilePath, options, cb);
      }
    });

    got
      .stream(url)
      .on('response', (response) => {
        // allows for overriding by the developer or automatically
        // populating based on server response.
        if (!options.typeOverride) {
          options.typeOverride = response.headers['content-type'].split(/;/)[0];
        }
      })
      .on('error', (error) => {
        const _cb = typeof options === 'function' ? options : cb;
        callbackCalled = true;
        _cb(error);
      })
      .pipe(file);
  } else {
    _returnArgsError(arguments);
  }
}

module.exports = {
  fromFileWithPath,
  fromFileWithMimeAndPath,
  fromBufferWithName,
  fromBufferWithMime,
  fromUrl,
};

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { fromBufferWithMime } from '../lib/index.js';

describe('textract', () => {
  function test(done) {
    return function (error, text) {
      expect(error).toBeNull();
      expect(text).toBeInstanceOf(String);
      expect(text.substring(0, 20)).to.eql('This is a test Just ');
      done();
    };
  }

  it('fromBufferWithMime(mimeType, buffer, options, callback)', (done) => {
    const filePath = path.join(__dirname, 'files', 'new docx(1).docx'),
      textBuff = fs.readFileSync(filePath);
    fromBufferWithMime(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      textBuff,
      {},
      test(done),
    );
  });

  it('fromBufferWithMime(mimeType, buffer, callback)', (done) => {
    const filePath = path.join(__dirname, 'files', 'new docx(1).docx'),
      textBuff = fs.readFileSync(filePath);
    fromBufferWithMime(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      textBuff,
      test(done),
    );
  });
});

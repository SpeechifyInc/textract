import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { extract } from '../lib/index.js';

describe('textract', () => {
  it('fromBufferWithMime(mimeType, buffer, options)', async () => {
    const filePath = path.join(__dirname, 'files', 'new docx(1).docx');
    const textBuff = fs.readFileSync(filePath);
    const text = await extract(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      textBuff,
      {},
    );
    expect(text.substring(0, 20)).toEqual('This is a test Just ');
  });

  it('fromBufferWithMime(mimeType, buffer)', async () => {
    const filePath = path.join(__dirname, 'files', 'new docx(1).docx');
    const textBuff = fs.readFileSync(filePath);
    const text = await extract(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      textBuff,
    );
    expect(text.substring(0, 20)).toEqual('This is a test Just ');
  });
});

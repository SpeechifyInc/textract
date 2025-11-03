import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const DIR = fileURLToPath(path.dirname(import.meta.url));

const cliPath = path.join(DIR, '..', 'bin', 'textract');
const testFilePath = path.join(DIR, 'files', 'css.css');

describe('cli', () => {
  it('will extract text', (done) => {
    exec(`${cliPath} ${testFilePath}`, (_error, stdout, _stderr) => {
      expect(stdout).to.eql('.foo {color:red}\n');
      done();
    });
  });
});

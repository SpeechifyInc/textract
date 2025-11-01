import { describe, it, expect } from 'vitest';

const { exec } = require('node:child_process');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'bin', 'textract');
const testFilePath = path.join(__dirname, 'files', 'css.css');

describe('cli', () => {
  it('will extract text', (done) => {
    exec(`${cliPath  } ${  testFilePath}`, (_error, stdout, _stderr) => {
      expect(stdout).to.eql('.foo {color:red}\n');
      done();
    });
  });
});

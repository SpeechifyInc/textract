import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { pdfTextExtract } from '../../lib/pdf-text-extract/index.js';

const DIR = fileURLToPath(path.dirname(import.meta.url));

describe('Pdf extract', () => {
  it('should return output and no error when everything is ok', async () => {
    const desiredNumPages = 8;
    const filePath = path.join(DIR, 'data', 'multipage.pdf');
    const pages = await pdfTextExtract(filePath);

    expect(pages.length).toBe(desiredNumPages);
    for (const page of pages) {
      expect(page).toBeDefined();
      expect(page.length).toBeGreaterThan(0);
    }
  });

  it('should accept files with space in name', async () => {
    const filePath = path.join(DIR, 'data', 'pdf with space in name.pdf');
    const pages = await pdfTextExtract(filePath);
    expect(pages.length).toBeGreaterThan(0);
  });

  it('should work with parallel data streams', async () => {
    const filePath = path.join(DIR, 'data', 'pdf with space in name.pdf');

    const promises = Array.from({ length: 10 }, () => pdfTextExtract(filePath));
    const pagesGroups = await Promise.all(promises);
    expect(pagesGroups.length).toBe(10);
    for (const pages of pagesGroups) {
      expect(pages).toBeDefined();
      expect(pages.length).toBeGreaterThan(0);
      expect(pages[0]).toBeDefined();
    }
  });

  it('should allow large files', { timeout: 5000 }, async () => {
    const filePath = path.join(DIR, 'data', 'huge.pdf');

    const pages = await pdfTextExtract(filePath, {
      cwd: null,
    });
    expect(pages.length).toBeGreaterThan(0);
  });

  it('should support custom pdftotext command', async () => {
    const filePath = path.join(DIR, 'data', 'multipage.pdf');
    const pdfToTextCommand = 'pdftotext';
    const pages = await pdfTextExtract(filePath, {}, pdfToTextCommand);
    expect(pages.length).toBeGreaterThan(0);
  });
});

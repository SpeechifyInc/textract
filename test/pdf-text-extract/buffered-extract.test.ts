import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { pdfTextExtract } from '../../lib/pdf-text-extract/index.js';

const DIR = fileURLToPath(path.dirname(import.meta.url));

describe('Buffered Extract', () => {
  it('should extract text', async () => {
    const desiredNumPages = 8;
    const filePath = path.join(DIR, 'data', 'multipage.pdf');
    const pages = await pdfTextExtract(filePath);

    expect(pages.length).toBe(desiredNumPages);
    for (const page of pages) {
      expect(page).toBeDefined();
      expect(page.length).toBeGreaterThan(0);
    }
  });
});

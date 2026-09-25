import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { describe, it, expect, vi } from 'vitest';
import { extractFromFile } from '../lib/index.js';

const DIR = fileURLToPath(path.dirname(import.meta.url));

interface ImageElement {
  altText?: string;
  readAsBase64String: () => Promise<string>;
}
type ConvertImage = (element: ImageElement) => Promise<unknown>;

describe('docx images', () => {
  // mammoth's default inlines every image reference as base64, so a DOCX with many or large images ran the
  // process out of heap for text that never reads them (PLA-12062).
  it('will convert docx images without reading their bytes', async () => {
    const convertToHtml = vi.spyOn(mammoth, 'convertToHtml');
    await extractFromFile(path.join(DIR, 'files', 'images.docx'));
    const convertImage = convertToHtml.mock.calls[0]?.[1]
      ?.convertImage as unknown as ConvertImage | undefined;
    convertToHtml.mockRestore();

    const readAsBase64String = vi.fn(() => Promise.resolve('aW1hZ2U='));
    await convertImage?.({ altText: 'Quarterly chart', readAsBase64String });

    expect(convertImage).toBeDefined();
    expect(readAsBase64String).not.toHaveBeenCalled();
  });
});

import type { Options, URLOptions } from './types.ts';

/**
 * Get text from file by path
 * @param filePath path to file
 * @param callback callback
 */
export function fromFileWithPath(
  filePath: string,
  callback: (error: Error | null, text: string) => void,
): void;
/**
 * Get text from file by path
 * @param filePath path to file
 * @param config configuration object
 * @param callback callback
 */
export function fromFileWithPath(
  filePath: string,
  config: Options,
  callback: (error: Error | null, text: string) => void,
): void;

/**
 * Get text from file by path
 * @param mimeType mime type of file
 * @param filePath path to file
 * @param callback callback
 */
export function fromFileWithMimeAndPath(
  mimeType: string,
  filePath: string,
  callback: (error: Error | null, text: string) => void,
): void;
/**
 * Get text from file by path
 * @param mimeType mime type of file
 * @param filePath path to file
 * @param config configuration object
 * @param callback callback
 */
export function fromFileWithMimeAndPath(
  mimeType: string,
  filePath: string,
  config: Options,
  callback: (error: Error | null, text: string) => void,
): void;

/**
 * Get text from file buffer
 * @param mimeType mime type of file
 * @param buffer path to file
 * @param callback callback
 */
export function fromBufferWithMime(
  mimeType: string,
  buffer: Buffer,
  callback: (error: Error | null, text: string) => void,
): void;
/**
 * Get text from file buffer
 * @param mimeType mime type of file
 * @param buffer path to file
 * @param config configuration object
 * @param callback callback
 */
export function fromBufferWithMime(
  mimeType: string,
  buffer: Buffer,
  config: Options,
  callback: (error: Error | null, text: string) => void,
): void;

/**
 * Get text from file buffer
 * @param name file name or path
 * @param buffer buffer with file content
 * @param callback callback
 */
export function fromBufferWithName(
  name: string,
  buffer: Buffer,
  callback: (error: Error | null, text: string) => void,
): void;
/**
 * Get text from file buffer
 * @param name file name or path
 * @param buffer buffer with file content
 * @param config configuration object
 * @param callback callback
 */
export function fromBufferWithName(
  name: string,
  buffer: Buffer,
  config: Options,
  callback: (error: Error | null, text: string) => void,
): void;

/**
 * Get text from url
 * @param url url as string or object
 * @param callback callback
 */
export function fromUrl(
  url: string | URL,
  callback: (error: Error | null, text: string) => void,
): void;
/**
 * Get text from url
 * @param url url as string or object
 * @param config configuration object
 * @param callback callback
 */
export function fromUrl(
  url: string | URL,
  config: URLOptions,
  callback: (error: Error | null, text: string) => void,
): void;

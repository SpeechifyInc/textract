import { spawn } from 'node:child_process';
import path from 'node:path';

export interface Options {
  firstPage?: number | undefined;
  lastPage?: number | undefined;
  resolution?: number | undefined;
  crop?:
    | {
        x: number;
        y: number;
        w: number;
        h: number;
      }
    | undefined;
  /**
   * Do not change unless you know what you are doing!
   * @default "raw"
   */
  layout?: 'layout' | 'raw' | 'htmlmeta' | undefined;
  /**
   * @default "UTF-8"
   */
  encoding?:
    | 'UCS-2'
    | 'ASCII7'
    | 'Latin1'
    | 'UTF-8'
    | 'ZapfDingbats'
    | 'Symbol'
    | undefined;
  eol?: 'unix' | 'dos' | 'mac' | undefined;
  ownerPassword?: string | undefined;
  userPassword?: string | undefined;
  cwd?: string | null;
}

/**
 * Build the arguments for the pdftotext command
 * @param options - The options for the extraction
 * @returns The arguments for the pdftotext command
 */
function buildArgs(options: Options) {
  const resolvedOptions = {
    encoding: 'UTF-8',
    layout: 'layout',
    ...options,
  };

  // Build args based on options
  const args: string[] = [];

  // First and last page to convert
  if (resolvedOptions.firstPage !== undefined) {
    args.push('-f');
    args.push(resolvedOptions.firstPage.toString());
  }
  if (resolvedOptions.lastPage !== undefined) {
    args.push('-l');
    args.push(resolvedOptions.lastPage.toString());
  }

  // Resolution, in dpi. (null is pdftotext default = 72)
  if (resolvedOptions.resolution !== undefined) {
    args.push('-r');
    args.push(resolvedOptions.resolution.toString());
  }

  // If defined, should be an object { x:x, y:y, w:w, h:h }
  if (resolvedOptions.crop !== undefined) {
    if (resolvedOptions.crop.x !== undefined) {
      args.push('-x');
      args.push(resolvedOptions.crop.x.toString());
    }
    if (resolvedOptions.crop.y !== undefined) {
      args.push('-y');
      args.push(resolvedOptions.crop.y.toString());
    }
    if (resolvedOptions.crop.w !== undefined) {
      args.push('-W');
      args.push(resolvedOptions.crop.w.toString());
    }
    if (resolvedOptions.crop.h !== undefined) {
      args.push('-H');
      args.push(resolvedOptions.crop.h.toString());
    }
  }

  // One of either 'layout', 'raw' or 'htmlmeta'
  if (resolvedOptions.layout === 'layout') {
    args.push('-layout');
  } else if (resolvedOptions.layout === 'raw') {
    args.push('-raw');
  } else if (resolvedOptions.layout === 'htmlmeta') {
    args.push('-htmlmeta');
  }

  // Output text encoding (UCS-2, ASCII7, Latin1, UTF-8, ZapfDingbats or Symbol)
  if (resolvedOptions.encoding) {
    args.push('-enc');
    args.push(resolvedOptions.encoding);
  }

  // Output end of line convention (unix, dos or mac)
  if (resolvedOptions.eol !== undefined) {
    args.push('-eol');
    args.push(resolvedOptions.eol);
  }

  // Owner and User password (for encrypted files)
  if (resolvedOptions.ownerPassword !== undefined) {
    args.push('-opw');
    args.push(resolvedOptions.ownerPassword);
  }
  if (resolvedOptions.userPassword !== undefined) {
    args.push('-upw');
    args.push(resolvedOptions.userPassword);
  }

  return args;
}

/**
 * Split the content into pages
 * @param content - The content to split
 * @returns The pages
 */
function splitPages(content: string) {
  const pages = content.split(/\f/);
  if (!pages.length) {
    throw new Error(
      'pdf-text-extract failed: no text returned from the pdftotext command',
    );
  }
  // sometimes there can be an extract blank page on the end
  const lastPage = pages[pages.length - 1];
  if (!lastPage) {
    pages.pop();
  }
  return pages;
}

/**
 * Spawns pdftotext and returns its output
 * @param command - The command to use to extract the text
 * @param args - The arguments to use to extract the text
 * @param options - The options to use to extract the text
 * @param cb - The callback to use to handle the output
 */
function streamResults(
  command: string,
  args: string[],
  options: Options,
  cb: (error: Error | null, output: string) => void,
) {
  let output = '';
  let stderr = '';

  const stdoutHandler = (data: string) => {
    output += data;
  };

  const stderrHandler = (data: string) => {
    stderr += data;
  };

  const closeHandler = (code: number) => {
    if (code !== 0) {
      cb(new Error(`pdf-text-extract command failed: ${stderr}`), '');
      return;
    }
    cb(null, output);
  };

  const child = spawn(command, args, { cwd: options.cwd ?? undefined });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', stdoutHandler);
  child.stderr.on('data', stderrHandler);
  child.on('close', closeHandler);
}

/**
 * Extract the text from the PDF file
 * @param filePath - The path to the PDF file
 * @param options - The options for the extraction
 * @param pdfToTextCommand - The command to use to extract the text
 * @returns The pages from the PDF file
 */
export async function pdfTextExtract(
  filePath: string,
  options: Options = {},
  pdfToTextCommand = 'pdftotext',
) {
  const resolvedFilePath = path.resolve(filePath);

  const args = buildArgs(options);
  // finish up arguments
  args.push(resolvedFilePath);
  args.push('-');

  return new Promise<string[]>((resolve, reject) => {
    streamResults(pdfToTextCommand, args, options, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(splitPages(output));
    });
  });
}

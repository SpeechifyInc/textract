import type { ExecOptions } from 'node:child_process';

export interface ExtractorExecOptions {
  exec: ExecOptions;
}

export interface Options {
  /**
   * Pass this in as true and textract will not strip any line breaks.
   * @default false
   */
  preserveLineBreaks?: boolean | undefined;
  /**
   * Some extractors, like PDF, insert line breaks at the end of every line, even if the middle of a sentence.
   * If this option is set to true, then any instances of a single line break are removed but multiple line breaks are preserved.
   * Check your output with this option, though, this doesn't preserve paragraphs unless there are multiple breaks.
   * @default false
   */
  preserveOnlyMultipleLineBreaks?: boolean | undefined;
  /**
   * Some extractors (dxf) use node's exec functionality.
   * This setting allows for providing config to exec execution.
   * One reason you might want to provide this config is if you are dealing with very large files.
   * You might want to increase the exec maxBuffer setting.
   */
  exec?: ExtractorExecOptions['exec'] | undefined;
  /**
   * Doc extractor options for non OS X.
   * See `drawingtotext` manual for available options
   */
  doc?: ExtractorExecOptions | undefined;
  /**
   * DXF extractor options.
   * See `antiword` manual for available options
   */
  dxf?: ExtractorExecOptions | undefined;
  /**
   * Images (png, jpg, gif) extractor options.
   * See `tesseract` manual for available options
   */
  images?: ExtractorExecOptions | undefined;
  /**
   * RTF extractor options.
   * See `unrtf` manual for available options
   */
  rtf?: ExtractorExecOptions | undefined;
  tesseract?:
    | {
        /**
         *  A pass-through to tesseract allowing for setting of language for extraction.
         */
        lang: string;
      }
    | {
        /**
         * `tesseract.lang` allows a quick means to provide the most popular tesseract option,
         * but if you need to configure more options, you can simply pass `cmd`.
         * `cmd` is the string that matches the command-line options you want to pass to tesseract.
         * For instance, to provide language and psm,
         * you would pass `{ tesseract: { cmd:"-l chi_sim -psm 10" } }`
         */
        cmd: string;
      }
    | undefined;
  /**
   * This is a proxy options object to the library textract uses for pdf extraction: pdf-text-extract.
   * Options include ownerPassword, userPassword if you are extracting text from password protected PDFs.
   * IMPORTANT: textract modifies the pdf-text-extract layout default so that, instead of layout: layout, it uses layout:raw.
   * It is not suggested you modify this without understanding what trouble that might get you in.
   * See [this GH issue](https://github.com/dbashford/textract/issues/75) for why textract overrides that library's default.
   */
  pdftotextOptions?:
    | {
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
        /**
         * @default true
         */
        splitPages?: boolean | undefined;
      }
    | undefined;
  /**
   * When extracting HTML, whether or not to include `alt` text with the extracted text.
   * @default false
   */
  includeAltText?: boolean | undefined;
}

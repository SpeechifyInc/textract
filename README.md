# textract

## Currently Extracts...

- HTML, HTM
- ATOM, RSS
- Markdown
- EPUB
- XML, XSL
- PDF
- DOC, DOCX
- ODT, OTT (experimental)
- RTF
- XLS, XLSX, XLSB, XLSM, XLTX
- CSV
- ODS, OTS
- PPTX, POTX
- ODP, OTP
- ODG, OTG
- PNG, JPG, GIF
- `application/javascript`
- All `text/*` mime-types.

In almost all cases above, what textract cares about is the mime type. So `.html` and `.htm`, both possessing the same mime type, will be extracted. Other extensions that share mime types with those above should also extract successfully. For example, `application/vnd.ms-excel` is the mime type for `.xls`, but also for 5 other file types.

_Does textract not extract from files of the type you need?_ Add an issue or submit a pull request. It many cases textract is already capable, it is just not paying attention to the mime type you may be interested in.

## Install

```
npm install textract
```

## Extraction Requirements

Note, if any of the requirements below are missing, textract will run and extract all files for types it is capable. Not having these items installed does not prevent you from using textract, it just prevents you from extracting those specific files.

- `PDF` extraction requires `pdftotext` be installed, [link](http://www.foolabs.com/xpdf/download.html)
- `DOC` extraction requires `antiword` be installed, [link](http://www.winfield.demon.nl/), unless on OSX in which case textutil (installed by default) is used.
- `RTF` extraction requires `unrtf` be installed, [link](https://www.gnu.org/software/unrtf/), unless on OSX in which case textutil (installed by default) is used.
- `PNG`, `JPG` and `GIF` require `tesseract` to be available, [link](http://code.google.com/p/tesseract-ocr/). Images need to be pretty clear, high DPI and made almost entirely of just text for `tesseract` to be able to accurately extract the text.

## Configuration

Configuration can be passed into textract. The following configuration options are available

- `preserveLineBreaks`: When using the command line this is set to `true` to preserve stdout readability. When using the library via node this is set to `false`. Pass this in as `true` and textract will not strip any line breaks.
- `preserveOnlyMultipleLineBreaks`: Some extractors, like PDF, insert line breaks at the end of every line, even if the middle of a sentence. If this option (default `false`) is set to `true`, then any instances of a single line break are removed but multiple line breaks are preserved. Check your output with this option, though, this doesn't preserve paragraphs unless there are multiple breaks.
- `exec`: Some extractors (doc) use node's `exec` functionality. This setting allows for providing [config to `exec` execution](http://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback). One reason you might want to provide this config is if you are dealing with very large files. You might want to increase the `exec` `maxBuffer` setting.
- `[ext].exec`: Each extractor can take specific exec config. Keep in mind many extractors are responsible for extracting multiple types, so, for instance, the `odt` extractor is what you would configure for `odt` and `odg`/`odt` etc. Check [the extractors](https://github.com/dbashford/textract/tree/master/lib/extractors) to see which you want to specifically configure. At the bottom of each is a list of `types` for which the extractor is responsible.
- `tesseract.lang`: A pass-through to tesseract allowing for setting of language for extraction. ex: `{ tesseract: { lang:"chi_sim" } }`
- `tesseract.cmd`: `tesseract.lang` allows a quick means to provide the most popular tesseract option, but if you need to configure more options, you can simply pass `cmd`. `cmd` is the string that matches the command-line options you want to pass to tesseract. For instance, to provide language and `psm`, you would pass `{ tesseract: { cmd:"-l chi_sim --psm 10" } }`
- `pdftotextOptions`: This is a proxy options object to the library textract uses for pdf extraction: [pdf-text-extract](https://github.com/nisaacson/pdf-text-extract). Options include `ownerPassword`, `userPassword` if you are extracting text from password protected PDFs. IMPORTANT: textract modifies the pdf-text-extract `layout` default so that, instead of `layout: layout`, it uses `layout:raw`. It is not suggested you modify this without understanding what trouble that might get you in. See [this GH issue](https://github.com/dbashford/textract/issues/75) for why textract overrides that library's default.
- `typeOverride`: Used with `fromUrl`, if set, rather than using the `content-type` from the URL request, will use the provided `typeOverride`.
- `includeAltText`: When extracting HTML, whether or not to include `alt` text with the extracted text. By default this is `false`.

To use this configuration at the command line, prefix each open with a `--`.

Ex: `textract image.png --tesseract.lang=deu`

## Usage

```javascript
import {extract} from 'textract';

extractFromBuffer(contentBuffer, mimeType, options?);

// or

extractFromFile("/path/to/file.docx", mimeType?, options?);
```

## Testing Notes

### Running on a Mac

- `brew install tesseract tesseract-lang`

NOTE! The Word processing results are inconsistent between OSX and Linux (different utils are used), so the test themselves are relaxed to accomodate for both cases.

import path from 'node:path';
import textract from './index.js';

export default function (filePath, flags) {
  const fullFilePath = path.resolve(process.cwd(), filePath);
  const resolvedFlags = { ...flags };

  if (resolvedFlags.preserveLineBreaks === 'false') {
    resolvedFlags.preserveLineBreaks = false;
  } else {
    resolvedFlags.preserveLineBreaks = true;
  }

  textract.fromFileWithPath(fullFilePath, flags, (error, text) => {
    if (error) {
      console.error(error);
    } else {
      console.log(text);
    }
  });
}

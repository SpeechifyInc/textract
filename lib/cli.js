var path = require('node:path'),
  textract = require('./index');

module.exports = function (filePath, flags) {
  filePath = path.resolve(process.cwd(), filePath);

  if (flags.preserveLineBreaks === 'false') {
    flags.preserveLineBreaks = false;
  } else {
    flags.preserveLineBreaks = true;
  }

  textract.fromFileWithPath(filePath, flags, (error, text) => {
    if (error) {
       
      console.error(error);
    } else {
       
      console.log(text);
    }
  });
};

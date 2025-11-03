import fs from 'node:fs';

var extractText = function (filePath, options, cb) {
  /*
  var captured = ppt.readFile(filePath);
  console.log('CAPTURED!!!!')
  console.log(captured)
  console.log('CAPTURED!!!!')
  cb( null, null );
    if ( error ) {
      cb( error, null );
      return;
    }
    cb( null, data.toString() );
  */
};

export default {
  // types: ['application/vnd.ms-powerpoint'],
  types: [],
  extract: extractText,
};

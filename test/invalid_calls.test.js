import { describe, it, expect } from 'vitest';
import { fromBufferWithMime } from '../lib/index.js';

function test() {
  return function (error, text) {
    expect(text).toBeNull();
    expect(error).not.toBeNull();
    expect(error).toHaveProperty('message');
    expect(error.message).toEqual('Incorrect parameters passed to textract.');
  };
}

describe('when passed incorrect parameters', () => {
  it('should return an error 1', (done) => {
    fromBufferWithMime(test(done));
  });

  it('should return an error 2', (done) => {
    fromBufferWithMime(false, test(done));
  });

  it('should return an error 3', (done) => {
    fromBufferWithMime(test(done), false);
  });

  it('should return an error 4', (done) => {
    fromBufferWithMime('foo', test(done), false);
  });

  it('should return an error 5', (done) => {
    fromBufferWithMime('foo', {}, false, test(done));
  });
});

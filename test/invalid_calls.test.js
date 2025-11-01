import { describe, it, expect } from 'vitest';
const {
  fromFileWithPath,
  fromFileWithMimeAndPath,
  fromBufferWithName,
  fromBufferWithMime,
} = require('../lib');

var test = function () {
  return function (error, text) {
    expect(text).to.be.null;
    expect(error).not.toBeNull();
    expect(error).to.have.property('message');
    expect(error.message).to.eql('Incorrect parameters passed to textract.');
  };
};

var pathTests = function (funct) {
  it('should return an error 1', (done) => {
    funct(test(done));
  });

  it('should return an error 2', (done) => {
    funct(false, test(done));
  });

  it('should return an error 3', (done) => {
    funct(test(done), false);
  });

  it('should return an error 4', (done) => {
    funct('foo', test(done), false);
  });

  it('should return an error 5', (done) => {
    funct('foo', {}, false, test(done));
  });
};

var bufferTests = function (funct) {
  it('should return an error 1', (done) => {
    funct(test(done));
  });

  it('should return an error 2', (done) => {
    funct(false, test(done));
  });

  it('should return an error 3', (done) => {
    funct(test(done), false);
  });

  it('should return an error 4', (done) => {
    funct('foo', test(done), false);
  });

  it('should return an error 5', (done) => {
    funct('foo', {}, false, test(done));
  });
};

describe('when passed incorrect parameters', () => {
  describe('fromFileWithPath', () => {
    pathTests(fromFileWithPath);
  });

  describe('fromFileWithMimeAndPath', () => {
    pathTests(fromFileWithMimeAndPath);
  });

  describe('fromBufferWithName', () => {
    bufferTests(fromBufferWithName);
  });

  describe('fromBufferWithMime', () => {
    bufferTests(fromBufferWithMime);
  });
});

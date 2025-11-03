import { describe, it, expect } from 'vitest';
import {
  fromFileWithPath,
  fromFileWithMimeAndPath,
  fromBufferWithName,
  fromBufferWithMime,
} from '../lib/index.js';

function test(done) {
  return function (error, text) {
    expect(text).toBeNull();
    expect(error).not.toBeNull();
    expect(error).toHaveProperty('message');
    expect(error.message).toEqual('Incorrect parameters passed to textract.');
    done();
  };
}

function pathTests(funct) {
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
}

function bufferTests(funct) {
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
}

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

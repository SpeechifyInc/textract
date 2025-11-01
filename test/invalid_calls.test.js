import { describe, it, expect } from "vitest";
const {
  fromFileWithPath,
  fromFileWithMimeAndPath,
  fromBufferWithName,
  fromBufferWithMime,
  fromUrl,
} = require("../lib");

var test = function () {
  return function (error, text) {
    expect(text).to.be.null;
    expect(error).not.toBeNull();
    expect(error).to.have.property("message");
    expect(error.message).to.eql("Incorrect parameters passed to textract.");
  };
};

var pathTests = function (funct) {
  it("should return an error 1", function (done) {
    funct(test(done));
  });

  it("should return an error 2", function (done) {
    funct(false, test(done));
  });

  it("should return an error 3", function (done) {
    funct(test(done), false);
  });

  it("should return an error 4", function (done) {
    funct("foo", test(done), false);
  });

  it("should return an error 5", function (done) {
    funct("foo", {}, false, test(done));
  });
};

var bufferTests = function (funct) {
  it("should return an error 1", function (done) {
    funct(test(done));
  });

  it("should return an error 2", function (done) {
    funct(false, test(done));
  });

  it("should return an error 3", function (done) {
    funct(test(done), false);
  });

  it("should return an error 4", function (done) {
    funct("foo", test(done), false);
  });

  it("should return an error 5", function (done) {
    funct("foo", {}, false, test(done));
  });
};

describe("when passed incorrect parameters", function () {
  describe("fromFileWithPath", function () {
    pathTests(fromFileWithPath);
  });

  describe("fromFileWithMimeAndPath", function () {
    pathTests(fromFileWithMimeAndPath);
  });

  describe("fromBufferWithName", function () {
    bufferTests(fromBufferWithName);
  });

  describe("fromBufferWithMime", function () {
    bufferTests(fromBufferWithMime);
  });
});

const { exec } = require("node:child_process");
const path = require("node:path");
import { describe, it, expect } from "vitest";

const cliPath = path.join(__dirname, "..", "bin", "textract");
const testFilePath = path.join(__dirname, "files", "css.css");

describe("cli", function () {
  it("will extract text", function (done) {
    exec(cliPath + " " + testFilePath, function (_error, stdout, _stderr) {
      expect(stdout).to.eql(".foo {color:red}\n");
      done();
    });
  });
});

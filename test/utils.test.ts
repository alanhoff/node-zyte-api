import assert from "node:assert/strict";
import test from "node:test";
import {
  createBasicAuthHeader,
  decodeBase64,
  decodeHttpResponseBody,
  decodeScreenshot,
  mergeHeaders,
  normalizeHeaders,
  ZyteConfigurationError,
} from "../src/index.ts";

test("createBasicAuthHeader encodes the API key as basic auth username", () => {
  assert.equal(createBasicAuthHeader(" foo "), "Basic Zm9vOg==");
});

test("createBasicAuthHeader rejects an empty API key", () => {
  assert.throws(() => createBasicAuthHeader("  "), ZyteConfigurationError);
});

test("normalizeHeaders lower-cases names and skips empty or nullish values", () => {
  assert.deepEqual(
    normalizeHeaders([
      [" X-Test ", 1],
      ["", "skip"],
      ["Null", null],
      ["Undefined", undefined],
      ["Enabled", true],
    ]),
    { enabled: "true", "x-test": "1" },
  );
});

test("normalizeHeaders accepts records and mergeHeaders applies later headers last", () => {
  assert.deepEqual(mergeHeaders({ A: "1", B: "2" }, { b: "3" }), { a: "1", b: "3" });
  assert.deepEqual(normalizeHeaders(undefined), {});
});

test("base64 helpers decode optional Zyte binary response fields", () => {
  const encoded = Buffer.from("hello", "utf8").toString("base64");
  assert.equal(decodeBase64(encoded).toString("utf8"), "hello");
  assert.equal(decodeHttpResponseBody({ httpResponseBody: encoded })?.toString("utf8"), "hello");
  assert.equal(decodeScreenshot({ screenshot: encoded })?.toString("utf8"), "hello");
  assert.equal(decodeHttpResponseBody({}), undefined);
  assert.equal(decodeScreenshot({}), undefined);
});

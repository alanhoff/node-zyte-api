import assert from "node:assert/strict";
import test from "node:test";
import {
  isProblem,
  parseProblem,
  ZyteApiError,
  ZyteConfigurationError,
  ZyteTransportError,
} from "../src/index.ts";

test("parseProblem returns structured Zyte problems", () => {
  const problem = parseProblem(
    JSON.stringify({ detail: "bad", status: 400, title: "Bad", type: "/bad" }),
  );
  assert.deepEqual(problem, { detail: "bad", status: 400, title: "Bad", type: "/bad" });
});

test("parseProblem ignores empty, invalid, and non-problem bodies", () => {
  assert.equal(parseProblem(""), undefined);
  assert.equal(parseProblem("not json"), undefined);
  assert.equal(parseProblem(JSON.stringify({ status: "400" })), undefined);
  assert.equal(isProblem(null), false);
  assert.equal(isProblem({ type: 1 }), false);
  assert.equal(isProblem({ title: 1 }), false);
  assert.equal(isProblem({ detail: 1 }), false);
  assert.equal(isProblem({ status: "400" }), false);
  assert.equal(isProblem({}), true);
});

test("custom errors expose stable names and API response accessors", () => {
  const response = {
    body: "{}",
    headers: {},
    problem: { title: "Nope" },
    status: 403,
    statusText: "Forbidden",
  };
  const apiError = new ZyteApiError("failed", response);
  assert.equal(apiError.name, "ZyteApiError");
  assert.equal(apiError.status, 403);
  assert.equal(apiError.problem?.title, "Nope");
  assert.equal(new ZyteConfigurationError("bad").name, "ZyteConfigurationError");
  assert.equal(new ZyteTransportError("bad").name, "ZyteTransportError");
});

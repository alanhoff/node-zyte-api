import assert from "node:assert/strict";
import test from "node:test";
import {
  createFetchTransport,
  createStaticResponse,
  headersToRecord,
  ZyteConfigurationError,
} from "../src/index.ts";

test("headersToRecord converts Headers to a lower-case record", () => {
  assert.deepEqual(headersToRecord(new Headers({ "X-Test": "ok" })), { "x-test": "ok" });
});

test("createFetchTransport maps ZyteHttpRequest to fetch and response text", async () => {
  const calls: Array<readonly [Parameters<typeof fetch>[0], RequestInit | undefined]> = [];
  const controller = new AbortController();
  const fakeFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push([input, init]);
    return new Response("body", {
      headers: { "X-Answer": "42" },
      status: 201,
      statusText: "Created",
    });
  }) as typeof fetch;

  const transport = createFetchTransport(fakeFetch);
  const response = await transport({
    body: "{}",
    headers: { accept: "application/json" },
    method: "POST",
    signal: controller.signal,
    url: new URL("https://api.example.test/extract"),
  });

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.[0]), "https://api.example.test/extract");
  assert.equal(calls[0]?.[1]?.body, "{}");
  assert.equal(calls[0]?.[1]?.signal, controller.signal);
  assert.deepEqual(response, {
    body: "body",
    headers: { "content-type": "text/plain;charset=UTF-8", "x-answer": "42" },
    status: 201,
    statusText: "Created",
  });
});

test("createFetchTransport rejects missing fetch and createStaticResponse normalizes headers", () => {
  assert.throws(
    () => createFetchTransport(null as unknown as typeof fetch),
    ZyteConfigurationError,
  );
  assert.deepEqual(createStaticResponse(202, "ok", { X: "y" }, "Accepted"), {
    body: "ok",
    headers: { x: "y" },
    status: 202,
    statusText: "Accepted",
  });
  assert.deepEqual(createStaticResponse(204, ""), {
    body: "",
    headers: {},
    status: 204,
    statusText: "",
  });
});

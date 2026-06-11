import assert from "node:assert/strict";
import test from "node:test";
import type { ZyteHttpRequest, ZyteHttpTransport } from "../src/index.ts";
import {
  composeSignal,
  normalizeBaseUrl,
  normalizeEndpoint,
  validateTimeout,
  ZyteApiError,
  ZyteClient,
  ZyteConfigurationError,
  ZyteTransportError,
} from "../src/index.ts";

test("ZyteClient sends extract requests through custom transports", async () => {
  const requests: ZyteHttpRequest[] = [];
  const transport: ZyteHttpTransport = async (request) => {
    requests.push(request);
    return {
      body: JSON.stringify({ statusCode: 200, url: "https://example.com/" }),
      headers: { "content-type": "application/json" },
      status: 200,
      statusText: "OK",
    };
  };
  const client = new ZyteClient({
    apiKey: "secret",
    baseUrl: "https://api.example.test/v1",
    defaultHeaders: { "X-Default": "default" },
    timeoutMs: 1000,
    transport,
    userAgent: "test-agent",
  });

  const response = await client.extract(
    { httpResponseBody: true, url: "https://example.com/" },
    { headers: { "X-Request": "request" } },
  );

  assert.equal(response.url, "https://example.com/");
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0]?.url), "https://api.example.test/v1/extract");
  assert.equal(requests[0]?.method, "POST");
  assert.equal(
    requests[0]?.body,
    JSON.stringify({ httpResponseBody: true, url: "https://example.com/" }),
  );
  const authorizationHeader = "authorization";
  assert.equal(requests[0]?.headers[authorizationHeader], "Basic c2VjcmV0Og==");
  assert.equal(requests[0]?.headers["user-agent"], "test-agent");
  assert.equal(requests[0]?.headers["x-default"], "default");
  assert.equal(requests[0]?.headers["x-request"], "request");
  assert.ok(requests[0]?.signal instanceof AbortSignal);
});

test("ZyteClient applies defaults and supports URL base objects", async () => {
  const requests: ZyteHttpRequest[] = [];
  const client = new ZyteClient({
    apiKey: "secret",
    baseUrl: new URL("https://api.example.test/v1/"),
    transport: async (request) => {
      requests.push(request);
      return {
        body: JSON.stringify({ url: "https://example.com/" }),
        headers: {},
        status: 200,
        statusText: "OK",
      };
    },
  });

  await client.extract({ browserHtml: true, url: "https://example.com/" });

  assert.equal(String(requests[0]?.url), "https://api.example.test/v1/extract");
  assert.equal(requests[0]?.headers["user-agent"], "zyte-client/0.1.0");
  assert.equal(requests[0]?.signal, undefined);
});

test("ZyteClient handles non-problem API errors with status fallback messages", async () => {
  const withStatusText = new ZyteClient({
    apiKey: "secret",
    transport: async () => ({ body: "nope", headers: {}, status: 429, statusText: "Too Many" }),
  });
  await assert.rejects(withStatusText.extract({ browserHtml: true, url: "https://example.com/" }), {
    message: "Too Many (429)",
  });

  const withoutStatusText = new ZyteClient({
    apiKey: "secret",
    transport: async () => ({ body: "nope", headers: {}, status: 500, statusText: "" }),
  });
  await assert.rejects(
    withoutStatusText.extract({ browserHtml: true, url: "https://example.com/" }),
    {
      message: "Zyte API request failed (500)",
    },
  );
});

test("ZyteClient preserves API errors raised by custom transports", async () => {
  const client = new ZyteClient({
    apiKey: "secret",
    transport: async () => {
      throw new ZyteApiError("custom", {
        body: "",
        headers: {},
        status: 418,
        statusText: "Teapot",
      });
    },
  });

  await assert.rejects(
    client.extract({ browserHtml: true, url: "https://example.com/" }),
    ZyteApiError,
  );
});

test("ZyteClient rejects absolute endpoint and request paths", async () => {
  const transport: ZyteHttpTransport = async () => ({
    body: JSON.stringify({ url: "https://example.com/" }),
    headers: {},
    status: 200,
    statusText: "OK",
  });

  assert.throws(
    () =>
      new ZyteClient({
        apiKey: "secret",
        endpoint: "https://evil.example/capture",
        transport,
      }),
    /relative, not an absolute URL/,
  );

  const client = new ZyteClient({ apiKey: "secret", transport });
  await assert.rejects(
    client.request("https://evil.example/capture", {
      url: "https://example.com/",
      browserHtml: true,
    }),
    /relative, not an absolute URL/,
  );
  await assert.rejects(
    client.request("//evil.example/capture", { url: "https://example.com/", browserHtml: true }),
    /relative, not an absolute URL/,
  );
  assert.throws(
    () =>
      new ZyteClient({
        apiKey: "secret",
        endpoint: String.raw`\\evil.example/capture`,
        transport,
      }),
    /relative, not an absolute URL/,
  );
  await assert.rejects(
    client.request(String.raw`\\evil.example/capture`, {
      url: "https://example.com/",
      browserHtml: true,
    }),
    /relative, not an absolute URL/,
  );
});

test("ZyteClient requires explicit opt-in for insecure HTTP base URLs", async () => {
  assert.throws(
    () => new ZyteClient({ apiKey: "secret", baseUrl: "http://localhost:8000/v1" }),
    /allowInsecureHttp/,
  );

  const requests: ZyteHttpRequest[] = [];
  const client = new ZyteClient({
    allowInsecureHttp: true,
    apiKey: "secret",
    baseUrl: "http://localhost:8000/v1",
    transport: async (request) => {
      requests.push(request);
      return {
        body: JSON.stringify({ url: "https://example.com/" }),
        headers: {},
        status: 200,
        statusText: "OK",
      };
    },
  });

  await client.extract({ browserHtml: true, url: "https://example.com/" });
  assert.equal(String(requests[0]?.url), "http://localhost:8000/v1/extract");
});

test("ZyteClient rejects paths that resolve outside the configured base path", async () => {
  const client = new ZyteClient({
    apiKey: "secret",
    baseUrl: "https://api.example.test/v1/",
    transport: async () => ({ body: "{}", headers: {}, status: 200, statusText: "OK" }),
  });

  await assert.rejects(
    client.request("../capture", { url: "https://example.com/", browserHtml: true }),
    /configured baseUrl path/,
  );
});

test("ZyteClient falls back to global fetch", async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", (async (
    _input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ url: "https://example.com/" }), { status: 200 });
  }) as typeof fetch);

  const client = new ZyteClient({ apiKey: "secret" });
  const response = await client.extract({ browserHtml: true, url: "https://example.com/" });

  assert.equal(response.url, "https://example.com/");
  assert.equal(calls[0]?.method, "POST");
});

test("ZyteClient exposes API problems on non-2xx responses", async () => {
  const client = new ZyteClient({
    apiKey: "secret",
    transport: async () => ({
      body: JSON.stringify({
        detail: "denied",
        status: 403,
        title: "Forbidden",
        type: "/forbidden",
      }),
      headers: { "content-type": "application/problem+json" },
      status: 403,
      statusText: "Forbidden",
    }),
  });

  await assert.rejects(
    client.extract({ url: "https://example.com/", browserHtml: true }),
    (error) => {
      assert.ok(error instanceof ZyteApiError);
      assert.equal(error.status, 403);
      assert.equal(error.problem?.title, "Forbidden");
      return true;
    },
  );
});

test("ZyteClient reports invalid success JSON as an API error", async () => {
  const client = new ZyteClient({
    apiKey: "secret",
    transport: async () => ({ body: "not json", headers: {}, status: 200, statusText: "OK" }),
  });

  await assert.rejects(
    client.extract({ url: "https://example.com/", browserHtml: true }),
    ZyteApiError,
  );
});

test("ZyteClient wraps transport failures but preserves library errors", async () => {
  const transportFailure = new ZyteClient({
    apiKey: "secret",
    transport: async () => {
      throw new Error("socket closed");
    },
  });
  await assert.rejects(
    transportFailure.extract({ url: "https://example.com/", browserHtml: true }),
    ZyteTransportError,
  );

  const configurationFailure = new ZyteClient({
    apiKey: "secret",
    transport: async () => {
      throw new ZyteConfigurationError("bad transport config");
    },
  });
  await assert.rejects(
    configurationFailure.extract({ url: "https://example.com/", browserHtml: true }),
    ZyteConfigurationError,
  );
});

test("configuration helpers reject invalid inputs", () => {
  assert.throws(() => new ZyteClient({ apiKey: "" }), ZyteConfigurationError);
  assert.throws(() => normalizeBaseUrl("notaurl"), /absolute URL/);
  assert.throws(() => normalizeBaseUrl("ftp://example.com"), /http: or https:/);
  assert.throws(() => normalizeEndpoint("  /  "), /non-empty/);
  assert.throws(() => validateTimeout(0, "timeoutMs"), /positive safe integer/);
  assert.throws(
    () => validateTimeout(Number.MAX_SAFE_INTEGER + 1, "timeoutMs"),
    /positive safe integer/,
  );
  assert.equal(
    String(normalizeBaseUrl("https://api.example.test/v1")),
    "https://api.example.test/v1/",
  );
  assert.equal(normalizeEndpoint("/extract"), "extract");
  assert.equal(validateTimeout(undefined, "timeoutMs"), undefined);
});

test("composeSignal returns the expected signal shape", () => {
  const controller = new AbortController();
  assert.equal(composeSignal(undefined, undefined), undefined);
  assert.equal(composeSignal(controller.signal, undefined), controller.signal);
  assert.ok(composeSignal(undefined, 100) instanceof AbortSignal);
  assert.ok(composeSignal(controller.signal, 100) instanceof AbortSignal);
});

test("assertResolvedUrlWithinBase rejects cross-origin resolved URLs", async () => {
  const { assertResolvedUrlWithinBase } = await import("../src/index.ts");
  assert.throws(
    () =>
      assertResolvedUrlWithinBase(
        new URL("https://evil.example/v1/extract"),
        new URL("https://api.example.test/v1/"),
      ),
    /configured baseUrl origin/,
  );
});

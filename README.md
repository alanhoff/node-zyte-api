# zyte-api

A Node.js-only TypeScript client for Zyte API `POST /v1/extract`.

- ESM-only package for Node.js `>=24.15.0`.
- Development uses native Node TypeScript execution, `node:test`, and built-in `fetch`.
- Build output is the only transpiled JavaScript.
- No runtime dependencies.
- Full `/extract` request/response type coverage generated from the official Zyte OpenAPI 3.0.3 spec.
- Pluggable HTTP transport with native `fetch` as the default.

Official API reference used for the schema: <https://docs.zyte.com/zyte-api/usage/reference.html>.

## Install

```sh
npm install zyte-api
```

## Quick start

```ts
import { ZyteClient, decodeHttpResponseBody } from "zyte-api";

const client = new ZyteClient({ apiKey: process.env.ZYTE_API_KEY ?? "" });

const response = await client.extract({
  url: "https://example.com/",
  httpResponseBody: true,
  httpResponseHeaders: true,
});

console.log(response.statusCode, response.url);
console.log(decodeHttpResponseBody(response)?.toString("utf8"));
```

## Custom HTTP transport

Use a custom transport to plug in your own HTTP stack, observability, retry policy, proxy handling, or test double.

```ts
import { headersToRecord, ZyteClient, type ZyteHttpTransport } from "zyte-api";

const transport: ZyteHttpTransport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: headersToRecord(response.headers),
    body: await response.text(),
  };
};

const client = new ZyteClient({ apiKey: "YOUR_ZYTE_API_KEY", transport });
```

## API

### `new ZyteClient(options)`

```ts
type ZyteClientOptions = {
  apiKey: string;
  baseUrl?: string | URL;
  endpoint?: string;
  transport?: ZyteHttpTransport;
  defaultHeaders?: HeaderInit;
  userAgent?: string;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
};
```

By default, requests go to `https://api.zyte.com/v1/extract` and use native `fetch`.
Zyte Basic authentication is configured automatically with the API key as username and an empty password.

`endpoint` and `request(path, ...)` must be relative paths. Absolute URLs are rejected so the Authorization header cannot be routed to an unexpected origin. `baseUrl` must use HTTPS by default; set `allowInsecureHttp: true` only for local/test transports.

### `client.extract(request, options?)`

Sends a typed Zyte `/extract` request and returns a typed response.
The exported `ExtractRequest` and `ExtractResponse` types are generated as strict
schema-shaped TypeScript types: schema-defined objects reject unknown keys at
compile time, while fields that the Zyte API models as free-form data (for
example `echoData`, custom attribute values, and header maps) remain typed as
`unknown` or records.

```ts
const product = await client.extract({
  url: "https://example.com/product/1",
  product: true,
});
```

### Transport support utilities

The root export includes transport helper types and utilities for adapters and tests:

- `ZyteHttpTransport`, `ZyteHttpRequest`, `ZyteHttpResponse`
- `createFetchTransport()`
- `headersToRecord()`
- `createStaticResponse()`

The root export also includes configuration helpers (`normalizeBaseUrl`, `normalizeEndpoint`, `validateTimeout`, `composeSignal`) for adapter authors who need to mirror client behavior.

### Errors

- `ZyteApiError`: non-2xx response or invalid success JSON. Exposes `status`, `problem`, and `response`.
- `ZyteTransportError`: underlying HTTP transport rejected.
- `ZyteConfigurationError`: invalid API key, URL, endpoint, timeout, or missing native `fetch`.

## Development

```sh
npm install
npm run generate:types -- --check
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm pack --dry-run
```

The coverage gate targets hand-written runtime modules. Generated OpenAPI types are checked for schema coverage and freshness, but excluded from runtime coverage thresholds.

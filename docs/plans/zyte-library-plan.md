# Plan: Zyte API Node.js TypeScript library

## Goal
Create a fully fledged, clean Node.js TypeScript package for Zyte API `POST /v1/extract`, grounded in the Zyte OpenAPI 3.0.3 spec embedded in the official docs.

## Current evidence
- Official Zyte docs page embeds an OpenAPI 3.0.3 spec with one path, `/extract`, and 101 component schemas in `.omx/zyte-openapi.json`.
- Official Node download page checked on 2026-06-11 lists Node v26.3.0 as Current and Node v24.16.0 as LTS; local runtime is v24.15.0. The package will support Node `>=24.15.0`, which keeps this workspace testable while remaining compatible with latest Node 24/26 lines.

## ADR: source-first native TypeScript library

### Principles
- No browser compatibility or browser build.
- No runtime dependencies.
- Development runs TypeScript source directly on Node native type stripping; transpilation occurs only in `npm run build`.
- Public types cover all `/extract` request and response fields from the official OpenAPI schema.
- Runtime API stays small, explicit, and stable: client, transport contract, errors, utilities, generated schema types.

### Decision drivers
- User requires native TS and Node built-ins during development.
- User requires a pluggable underlying HTTP library with native fetch as the default.
- Full `/extract` schema coverage is more important than runtime validation.
- Strict TS and coverage gates must be enforceable locally.

### Options considered
1. **Hand-write all Zyte schema types**
   - Rejected: too error-prone for 101 schemas and likely to drift from the official spec.
2. **Add an OpenAPI generator dependency**
   - Rejected: violates the “as much native Node/built-ins as possible” constraint and adds avoidable dependency surface.
3. **Check in official spec snapshot and a small local generator script**
   - Chosen: keeps schema coverage reproducible, dependency-free at runtime, and easy to validate with golden tests.

### Consequences
- The checked-in generated types are not manually edited; changes go through `scripts/generate-openapi-types.mjs`.
- Generated types may be broad for highly dynamic `additionalProperties`/custom attribute shapes, but every schema and endpoint field remains represented.
- Runtime code remains manually reviewed and covered; generated code is typechecked and golden-tested but excluded from runtime coverage thresholds.

## OpenAPI type-generation contract
- Source: `.omx/zyte-openapi.json` extracted from the official docs page.
- Output: `src/generated/openapi-types.ts`.
- Must emit exactly one exported type per component schema plus aliases:
  - `ExtractRequest = Components["schemas"]["ExtractRequest"]`
  - `ExtractResponse = Components["schemas"]["Response200"]`
  - `ZyteProblem = Components["schemas"]["Problem"]`
- Generator must support:
  - `$ref` to component schemas.
  - `allOf` as intersections.
  - `oneOf`/`anyOf` as unions.
  - enums as string/number literal unions.
  - `nullable` as `| null`.
  - `additionalProperties` as index signatures / records.
  - arrays, objects, primitive formats, and free-form schemas as `unknown` where the OpenAPI schema is deliberately unconstrained.
- Acceptance check:
  - `npm run generate:types -- --check` fails if generated output is stale.
  - A test asserts all 101 OpenAPI schema names are represented in the generated source.

## Public API
- `ZyteClient` class with:
  - constructor accepting `{ apiKey, baseUrl?, endpoint?, transport?, defaultHeaders?, userAgent?, timeoutMs?, allowInsecureHttp? }`.
  - `extract(request, options?)` for `POST /extract`.
  - `request(path, payload, options?)` lower-level method for future expansion without exposing internals.
- Type exports:
  - `ExtractRequest`, `ExtractResponse`, `ZyteProblem`, generated schema component types.
  - `ZyteHttpTransport`, `ZyteHttpRequest`, `ZyteHttpResponse`, `ZyteRequestOptions`.
- Utility exports:
  - `decodeBase64`, `decodeHttpResponseBody`, `decodeScreenshot`.
  - `createBasicAuthHeader`, `normalizeHeaders`.
- Error exports:
  - `ZyteApiError` for non-2xx Zyte responses.
  - `ZyteTransportError` for transport/fetch failures.
  - `ZyteConfigurationError` for missing fetch/api key/etc.

## Transport interface contract
- `ZyteHttpRequest`:
  - `url: URL`
  - `method: "POST" | string`
  - `headers: Readonly<Record<string, string>>`
  - `body: string`
  - `signal?: AbortSignal`
- `ZyteHttpResponse`:
  - `status: number`
  - `statusText: string`
  - `headers: Readonly<Record<string, string>>`
  - `body: string`
- `ZyteHttpTransport` is `(request: ZyteHttpRequest) => Promise<ZyteHttpResponse>`.
- Timeout ownership:
  - Client creates an internal timeout signal when `timeoutMs` is set.
  - Per-request signal is composed with timeout via `AbortSignal.any` when both exist.
  - Custom transports receive only the final signal; they own mapping it to their HTTP stack.
- Fetch adapter mapping:
  - Uses global `fetch` when no custom transport is provided.
  - Sends URL string, method, headers, body, and signal.
  - Reads response text exactly once and lower-cases response header keys into a plain record.
- Error boundaries:
  - Transport rejections become `ZyteTransportError` unless already a library error.
  - Non-2xx responses become `ZyteApiError`, preserving status, headers, raw body, and parsed RFC-7807-like problem JSON when possible.
  - Invalid success JSON becomes `ZyteApiError` with raw response body.

## Native TypeScript and packaging constraints
- `package.json`:
  - ESM-only: `"type":"module"`.
  - `engines.node: ">=24.15.0"`.
  - `exports` points to `dist/index.js` and `dist/index.d.ts`.
  - `files` includes `dist`, `README.md`, `LICENSE`.
- Source/tests:
  - Use `.ts` files with explicit `.ts` relative imports.
  - Avoid non-erasable TypeScript: no enums, parameter properties, namespaces, decorators, or TS import aliases.
  - `tsconfig.json` uses `moduleResolution:"nodenext"`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `strict`, `noUncheckedSideEffectImports`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Build:
  - `tsconfig.build.json` emits JS and declarations to `dist` and rewrites relative `.ts` imports to `.js`.
  - Build is the only transpilation step.

## Implementation plan
1. Scaffold metadata/config/docs:
   - `package.json`, `tsconfig.json`, `tsconfig.build.json`, `biome.json`, `.npmignore` if needed, `README.md`, `LICENSE`.
2. Add `.omx/zyte-openapi.json` as the local planning/generated-types source only; do not publish it.
3. Implement `scripts/generate-openapi-types.mjs` and generate `src/generated/openapi-types.ts`.
4. Implement runtime modules:
   - `src/http.ts`: transport contracts and fetch adapter.
   - `src/errors.ts`: typed errors and JSON problem extraction.
   - `src/client.ts`: URL construction, auth, timeout/signal handling, JSON request/response handling.
   - `src/utils.ts`: base64 and header helpers.
   - `src/index.ts`: public exports.
5. Write tests with `node:test` directly against TypeScript source:
   - client request construction, default fetch transport, custom transport usage.
   - Basic auth and default/custom headers.
   - non-2xx problem parsing and error surface.
   - invalid JSON / transport failures.
   - timeout/signal behavior via signal composition without flaky sleeps.
   - base64 utilities and URL/base config validation.
   - generated type coverage/golden freshness.
6. Verify gates:
   - `npm run generate:types -- --check`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:coverage` with 100% line/branch/function coverage over `src/*.ts` and generated code excluded.
   - `npm run build`
   - `npm pack --dry-run`
   - smoke import from `dist`.

## Non-goals
- Browser compatibility.
- Runtime schema validation of every Zyte field.
- Calling the real Zyte API or requiring a user API key.
- Adding a third-party HTTP client.

## Risk controls
- Generated types are source-only and excluded from coverage thresholds.
- Runtime source avoids non-erasable TypeScript syntax so tests can run without transpilation.
- Default fetch is feature-detected and users can inject their own HTTP transport.
- README clearly documents Node version posture: latest Current/LTS compatible, locally verified on Node v24.15.0.

## Review-cycle 2 plan update

Independent code review returned REQUEST CHANGES and Architect returned WATCH. Required fixes before re-review:

1. Credential routing safety:
   - Reject absolute URLs in `endpoint` and `request(path, ...)` so Basic auth cannot be sent to an origin outside `baseUrl` by accident.
   - Add regression tests for constructor `endpoint: "https://evil.example/capture"` and `client.request("https://evil.example/capture", ...)`.
2. Typed configuration errors:
   - Make missing native `fetch` throw `ZyteConfigurationError`, matching README/plan contract.
   - Add test coverage for `createFetchTransport(null)` typed error.
3. Insecure HTTP handling:
   - Default to HTTPS-only for authenticated requests.
   - Add explicit `allowInsecureHttp?: boolean` option for local/test/non-production custom endpoints.
   - Document the option and test both rejection and explicit opt-in.
4. OpenAPI operation binding:
   - Extend generator spec assertion and test coverage to verify server URL, `POST /extract`, request schema ref `ExtractRequest`, and 200 response schema ref `Response200`.
5. Public API boundary:
   - Keep transport/testing helpers exported if useful, but document them as public support utilities in README.
   - Remove or avoid exposing low-level internal-only helpers from the root export unless documented.

Verification after fixes: rerun `npm run verify`, cleanup inventory, then independent code-review lanes again.

## Review-cycle 3 plan update

Second-pass Architect found one remaining BLOCK and one WATCH:
- Harden endpoint/path routing against backslash-prefixed authority switching. Use both pre-normalization rejection and post-resolution same-origin/base-path validation before attaching Basic auth.
- Remove `allowInsecureHttp` from per-request options because insecure transport is a base URL/client configuration decision, not a request option.

Add regression tests for backslash authority-switching constructor and `request(path)` inputs, rerun `npm run verify`, then run third independent review.

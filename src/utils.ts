import { Buffer } from "node:buffer";

export type HeaderRecord = Readonly<Record<string, string>>;
export type DecodedBinary = Uint8Array & {
  toString(encoding?: string): string;
};
export type HeaderValue = string | number | boolean | null | undefined;
export type HeaderInit = HeaderRecord | ReadonlyArray<readonly [string, HeaderValue]>;

export function createBasicAuthHeader(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("A non-empty Zyte API key is required.");
  }
  return `Basic ${Buffer.from(`${key}:`, "utf8").toString("base64")}`;
}

export function normalizeHeaders(headers: HeaderInit | undefined): HeaderRecord {
  if (!headers) {
    return {};
  }

  const entries = Array.isArray(headers) ? headers : Object.entries(headers);
  const normalized: Record<string, string> = {};

  for (const [rawName, rawValue] of entries) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    const name = rawName.trim().toLowerCase();
    if (!name) {
      continue;
    }
    normalized[name] = String(rawValue);
  }

  return normalized;
}

export function mergeHeaders(...headers: ReadonlyArray<HeaderInit | undefined>): HeaderRecord {
  const merged: Record<string, string> = {};
  for (const item of headers) {
    Object.assign(merged, normalizeHeaders(item));
  }
  return merged;
}

export function decodeBase64(value: string): DecodedBinary {
  return Buffer.from(value, "base64");
}

export function decodeHttpResponseBody(response: {
  readonly httpResponseBody?: string;
}): DecodedBinary | undefined {
  return response.httpResponseBody === undefined
    ? undefined
    : decodeBase64(response.httpResponseBody);
}

export function decodeScreenshot(response: {
  readonly screenshot?: string;
}): DecodedBinary | undefined {
  return response.screenshot === undefined ? undefined : decodeBase64(response.screenshot);
}

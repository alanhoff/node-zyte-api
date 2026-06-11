import { ZyteConfigurationError } from "./errors.ts";
import type { HeaderInit, HeaderRecord } from "./utils.ts";
import { normalizeHeaders } from "./utils.ts";

export type ZyteHttpRequest = Readonly<{
  url: URL;
  method: "POST" | string;
  headers: HeaderRecord;
  body: string;
  signal?: AbortSignal;
}>;

export type ZyteHttpResponse = Readonly<{
  status: number;
  statusText: string;
  headers: HeaderRecord;
  body: string;
}>;

export type ZyteHttpTransport = (request: ZyteHttpRequest) => Promise<ZyteHttpResponse>;

export function headersToRecord(headers: Headers): HeaderRecord {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

export function createFetchTransport(
  fetchImplementation: typeof fetch = globalThis.fetch,
): ZyteHttpTransport {
  if (typeof fetchImplementation !== "function") {
    throw new ZyteConfigurationError(
      "No fetch implementation is available. Provide a custom ZyteHttpTransport.",
    );
  }

  return async (request) => {
    const response = await fetchImplementation(request.url, {
      body: request.body,
      headers: request.headers,
      method: request.method,
      ...(request.signal ? { signal: request.signal } : {}),
    });

    return {
      body: await response.text(),
      headers: headersToRecord(response.headers),
      status: response.status,
      statusText: response.statusText,
    };
  };
}

export function createStaticResponse(
  status: number,
  body: string,
  headers?: HeaderInit,
  statusText = "",
): ZyteHttpResponse {
  return { body, headers: normalizeHeaders(headers), status, statusText };
}

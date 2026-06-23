import {
  createApiError,
  parseProblem,
  ZyteApiError,
  ZyteConfigurationError,
  ZyteTransportError,
} from "./errors.ts";
import type { ExtractRequest, ExtractResponse } from "./generated/openapi-types.ts";
import { createFetchTransport, type ZyteHttpResponse, type ZyteHttpTransport } from "./http.ts";
import { createBasicAuthHeader, type HeaderInit, mergeHeaders } from "./utils.ts";

const DEFAULT_BASE_URL = "https://api.zyte.com/v1/";
const DEFAULT_ENDPOINT = "extract";
const DEFAULT_USER_AGENT = "zyte-api/0.3.0";

export type ZyteClientOptions = Readonly<{
  apiKey: string;
  baseUrl?: string | URL;
  endpoint?: string;
  transport?: ZyteHttpTransport;
  defaultHeaders?: HeaderInit;
  userAgent?: string;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
}>;

export type ZyteRequestOptions = Readonly<{
  headers?: HeaderInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

export class ZyteClient {
  readonly baseUrl: URL;
  readonly endpoint: string;
  readonly transport: ZyteHttpTransport;
  readonly timeoutMs: number | undefined;

  readonly #apiKey: string;
  readonly #defaultHeaders: HeaderInit | undefined;
  readonly #userAgent: string;

  constructor(options: ZyteClientOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new ZyteConfigurationError("A non-empty Zyte API key is required.");
    }

    this.#apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? DEFAULT_BASE_URL,
      options.allowInsecureHttp === undefined
        ? {}
        : { allowInsecureHttp: options.allowInsecureHttp },
    );
    this.endpoint = normalizeEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
    this.transport = options.transport ?? createFetchTransport();
    this.#defaultHeaders = options.defaultHeaders;
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = validateTimeout(options.timeoutMs, "timeoutMs");
  }

  async extract(request: ExtractRequest, options?: ZyteRequestOptions): Promise<ExtractResponse> {
    return this.request<ExtractResponse>(this.endpoint, request, options);
  }

  async request<TResponse = unknown>(
    path: string,
    payload: unknown,
    options?: ZyteRequestOptions,
  ): Promise<TResponse> {
    const response = await this.send(path, payload, options);
    if (response.status < 200 || response.status >= 300) {
      const problem = parseProblem(response.body);
      throw createApiError(problem === undefined ? response : { ...response, problem });
    }

    try {
      return JSON.parse(response.body) as TResponse;
    } catch (error) {
      throw new ZyteApiError(`Zyte API returned invalid JSON (${response.status})`, response, {
        cause: error,
      });
    }
  }

  async send(
    path: string,
    payload: unknown,
    options?: ZyteRequestOptions,
  ): Promise<ZyteHttpResponse> {
    const timeoutMs = validateTimeout(options?.timeoutMs ?? this.timeoutMs, "options.timeoutMs");
    const signal = composeSignal(options?.signal, timeoutMs);
    const request = {
      body: JSON.stringify(payload),
      headers: this.createHeaders(options?.headers),
      method: "POST",
      ...(signal ? { signal } : {}),
      url: this.resolveUrl(path),
    } as const;

    try {
      return await this.transport(request);
    } catch (error) {
      if (error instanceof ZyteApiError || error instanceof ZyteConfigurationError) {
        throw error;
      }
      throw new ZyteTransportError("Zyte HTTP transport failed.", { cause: error });
    }
  }

  resolveUrl(path: string): URL {
    const endpoint = normalizeEndpoint(path);
    const url = new URL(endpoint, this.baseUrl);
    assertResolvedUrlWithinBase(url, this.baseUrl);
    return url;
  }

  createHeaders(headers?: HeaderInit): Readonly<Record<string, string>> {
    return {
      ...mergeHeaders(
        {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": this.#userAgent,
        },
        this.#defaultHeaders,
        headers,
      ),
      authorization: createBasicAuthHeader(this.#apiKey),
    };
  }
}

export type NormalizeBaseUrlOptions = Readonly<{
  allowInsecureHttp?: boolean;
}>;

export function normalizeBaseUrl(
  baseUrl: string | URL,
  options: NormalizeBaseUrlOptions = {},
): URL {
  const raw = baseUrl instanceof URL ? baseUrl.toString() : baseUrl;
  const normalized = raw.endsWith("/") ? raw : `${raw}/`;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ZyteConfigurationError("Zyte baseUrl must use http: or https:.");
    }
    if (url.protocol === "http:" && options.allowInsecureHttp !== true) {
      throw new ZyteConfigurationError(
        "Zyte baseUrl must use https:. Set allowInsecureHttp only for local or test transports.",
      );
    }
    return url;
  } catch (error) {
    if (error instanceof ZyteConfigurationError) {
      throw error;
    }
    throw new ZyteConfigurationError("Zyte baseUrl must be an absolute URL.", { cause: error });
  }
}

export function normalizeEndpoint(endpoint: string): string {
  const raw = endpoint.trim();
  if (/^[a-z][a-z0-9+.-]*:/iu.test(raw) || raw.startsWith("//") || raw.startsWith("\\")) {
    throw new ZyteConfigurationError("Zyte endpoint path must be relative, not an absolute URL.");
  }
  const trimmed = raw.replace(/^\/+/, "");
  if (!trimmed) {
    throw new ZyteConfigurationError("Zyte endpoint path must be non-empty.");
  }
  return trimmed;
}

export function validateTimeout(
  timeoutMs: number | undefined,
  fieldName: string,
): number | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ZyteConfigurationError(`${fieldName} must be a positive safe integer.`);
  }
  return timeoutMs;
}

export function composeSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  if (signal && timeoutMs !== undefined) {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  }
  if (signal) {
    return signal;
  }
  if (timeoutMs !== undefined) {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

export function assertResolvedUrlWithinBase(url: URL, baseUrl: URL): void {
  if (url.origin !== baseUrl.origin) {
    throw new ZyteConfigurationError(
      "Zyte endpoint path must resolve within the configured baseUrl origin.",
    );
  }

  if (!url.pathname.startsWith(baseUrl.pathname)) {
    throw new ZyteConfigurationError(
      "Zyte endpoint path must resolve within the configured baseUrl path.",
    );
  }
}

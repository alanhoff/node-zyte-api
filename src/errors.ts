import type { ZyteProblem } from "./generated/openapi-types.ts";
import type { HeaderRecord } from "./utils.ts";

export type ZyteErrorResponse = Readonly<{
  status: number;
  statusText: string;
  headers: HeaderRecord;
  body: string;
  problem?: ZyteProblem;
}>;

export class ZyteConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZyteConfigurationError";
  }
}

export class ZyteTransportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZyteTransportError";
  }
}

export class ZyteApiError extends Error {
  readonly response: ZyteErrorResponse;

  constructor(message: string, response: ZyteErrorResponse, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZyteApiError";
    this.response = response;
  }

  get status(): number {
    return this.response.status;
  }

  get problem(): ZyteProblem | undefined {
    return this.response.problem;
  }
}

export function parseProblem(body: string): ZyteProblem | undefined {
  if (!body.trim()) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (!isProblem(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function isProblem(value: unknown): value is ZyteProblem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as {
    readonly detail?: unknown;
    readonly status?: unknown;
    readonly title?: unknown;
    readonly type?: unknown;
  };
  return (
    (candidate.type === undefined || typeof candidate.type === "string") &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    (candidate.status === undefined || typeof candidate.status === "number") &&
    (candidate.detail === undefined || typeof candidate.detail === "string")
  );
}

export function createApiError(response: ZyteErrorResponse): ZyteApiError {
  const title = response.problem?.title ?? (response.statusText || "Zyte API request failed");
  return new ZyteApiError(`${title} (${response.status})`, response);
}

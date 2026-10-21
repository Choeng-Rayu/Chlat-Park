import { createApiClient, type ApiClient } from "@chlat/api-client";

/**
 * The web app's API client.
 *
 * A thin wrapper over `@chlat/api-client`, which is itself `openapi-fetch`
 * driven by the types generated from `specs/api/openapi.yaml`. Every path and
 * method is type-checked at the call site, so a typo in a path is a compile
 * error and the response body is typed from the same document the API
 * validates against.
 *
 * **The client is generated, not hand-written.** Until the OpenAPI document
 * is generated (`pnpm openapi:types`), the generated `schema.d.ts` carries no
 * paths, and `openapi-fetch` cannot type a call. The wrapper therefore
 * exposes an *untyped* escape hatch (`apiFetch`) for that window, so the app
 * compiles and runs before the contract is generated, and a typed client for
 * everything after.
 *
 * ## The envelope
 *
 * Every API response is wrapped in `{ success, data, message, error }`. This
 * module unwraps it: `apiFetch` returns `data` on success and throws an
 * `ApiError` on failure, so a caller never has to check `success` by hand.
 *
 * ## Domain rules
 *
 * The API is the only authority on what is valid. This client **never**
 * re-implements a rule — it does not decide whether a ticket is valid,
 * whether a fee is right, or whether an action is permitted. It reports what
 * the API said. (See `specs/README.md` §1, rule 4.)
 */

/** The shape of the API's success envelope. */
export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  message: string | null;
  error: null;
}

/** The shape of the API's error envelope. */
export interface ApiErrorEnvelope {
  success: false;
  data: null;
  message: string | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  } | null;
}

/** The API's response envelope. */
export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/**
 * An error raised by the API.
 *
 * The `code` is the stable, machine-readable value the web app branches on
 * (`AUTHZ_PERMISSION_DENIED`, `VALIDATION_FAILED`, …). The `requestId` is
 * the correlation id the API logs under.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Is this a 401? The caller should re-authenticate. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Is this a 403? The caller lacks the permission or the scope. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Is this a 429? The caller should back off. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** The options accepted by {@link apiFetch}. */
export interface ApiFetchOptions extends Omit<RequestInit, "body" | "method"> {
  /** The HTTP method. */
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** The request body. It is JSON-encoded. */
  body?: unknown;
  /** An absolute path such as `/admin/revenue`. */
  path: string;
  /** The access token, when the call is made on behalf of a signed-in actor. */
  token?: string | null;
  /** The query parameters. */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * The API base URL.
 *
 * On the server this is the internal URL (`http://api:3001` in
 * docker-compose); in the browser it is the public one. The two are
 * different variables for exactly that reason.
 */
export function apiBaseUrl(): string {
  const url =
    typeof window === "undefined"
      ? (process.env["API_INTERNAL_URL"] ?? process.env["NEXT_PUBLIC_API_URL"])
      : process.env["NEXT_PUBLIC_API_URL"];

  return (url ?? "http://localhost:3001").replace(/\/$/, "");
}

/**
 * Build a full API URL.
 *
 * @internal
 */
export function apiUrl(path: string, query?: ApiFetchOptions["query"]): string {
  const base = `${apiBaseUrl()}/api/v1${path.startsWith("/") ? path : `/${path}`}`;

  if (!query) {
    return base;
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const serialised = params.toString();
  return serialised ? `${base}?${serialised}` : base;
}

/**
 * Call the API and return the unwrapped `data`.
 *
 * @throws {ApiError} when the API answers with a non-2xx status.
 */
export async function apiFetch<T = unknown>(options: ApiFetchOptions): Promise<T> {
  const { method = "GET", body, path, token, query, headers, ...rest } = options;

  const response = await fetch(apiUrl(path, query), {
    ...rest,
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload: unknown;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | null;
    const error = envelope?.error;

    throw new ApiError(
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? envelope?.message ?? `The API answered with ${response.status}.`,
      response.status,
      error?.details,
      error?.requestId,
    );
  }

  const envelope = payload as ApiEnvelope<T> | null;

  if (envelope && typeof envelope === "object" && "success" in envelope) {
    if (!envelope.success) {
      const error = envelope.error;
      throw new ApiError(
        error?.code ?? "UNKNOWN_ERROR",
        error?.message ?? envelope.message ?? "The request failed.",
        response.status,
        error?.details,
        error?.requestId,
      );
    }

    return envelope.data;
  }

  // A response that is not an envelope at all is a contract violation; the
  // raw body is returned so the caller can see what happened.
  return payload as T;
}

/**
 * The typed client.
 *
 * It is created lazily so a missing `NEXT_PUBLIC_API_URL` never breaks a
 * module import at build time. Use it for every path the generated schema
 * knows about; use {@link apiFetch} only for paths the schema does not cover
 * yet.
 */
let typedClient: ApiClient | undefined;

export function getApiClient(): ApiClient {
  typedClient ??= createApiClient({ baseUrl: apiBaseUrl() });
  return typedClient;
}

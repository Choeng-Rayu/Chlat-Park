import createClient, { type ClientOptions } from "openapi-fetch";
import type { paths } from "./schema.js";

/**
 * The typed API client.
 *
 * `openapi-fetch` is driven by the types in `./schema.d.ts`, which are
 * generated from `specs/api/openapi.yaml`. Every path and method is therefore
 * type-checked at the call site: a typo in a path is a compile error, and the
 * response body is typed from the same document the API validates against.
 *
 * The client is deliberately thin — it carries the base URL, the credentials
 * and the shared headers, and nothing else. Every domain call stays in the
 * app that needs it.
 */

/** The options accepted by {@link createApiClient}. */
export interface CreateApiClientOptions extends Omit<ClientOptions, "baseUrl"> {
  /**
   * The API base URL, e.g. `http://localhost:3001`.
   *
   * On the server this is the internal URL (`http://api:3001` in
   * docker-compose); in the browser it is the public one
   * (`NEXT_PUBLIC_API_URL`).
   */
  baseUrl: string;
}

/**
 * Create a typed client for the Chlat-Park API.
 *
 * @example
 * ```ts
 * const api = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL! });
 * const { data, error } = await api.GET("/api/v1/parking-sessions");
 * ```
 */
export function createApiClient(options: CreateApiClientOptions) {
  const { baseUrl, ...rest } = options;

  return createClient<paths>({
    baseUrl,
    credentials: "include",
    ...rest,
  });
}

/** The client type returned by {@link createApiClient}. */
export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * The default client, configured from the environment.
 *
 * `NEXT_PUBLIC_API_URL` is inlined at build time on the client and read from
 * the process environment on the server, so the same import works in both.
 */
export const api: ApiClient = createApiClient({
  baseUrl:
    (typeof process !== "undefined" ? process.env["NEXT_PUBLIC_API_URL"] : undefined) ??
    "http://localhost:3001",
});

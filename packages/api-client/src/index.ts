/**
 * `@chlat/api-client` — the typed HTTP client for the Chlat-Park API.
 *
 * The types come from `specs/api/openapi.yaml` via `openapi-typescript`; the
 * client itself is `openapi-fetch`. Regenerate the types with:
 *
 *   pnpm --filter @chlat/api-client run generate
 */
export { api, createApiClient } from "./client.js";
export type { ApiClient, CreateApiClientOptions } from "./client.js";

export type { paths, components, operations } from "./schema.js";

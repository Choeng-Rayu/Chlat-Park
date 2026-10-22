/**
 * The API's URL prefix.
 *
 * Every route the server exposes lives under this prefix: the OpenAPI
 * document publishes it, the generated client encodes it into every path, and
 * the web app builds its request URLs from it.
 *
 * **It is defined here, in its own module, rather than in `openapi.ts`, for
 * one reason: this module has no dependencies.**
 *
 * `openapi.ts` imports `zod-openapi`, which is a build-time concern. If the
 * prefix lived there, the browser would have to pull the OpenAPI generator
 * into its bundle just to learn where the API lives. A dependency-free module
 * can be imported by the web app at no cost, so the constant can be shared
 * without a second copy of the string.
 *
 * This is the same failure the prefix already caused once: the server said
 * `/v1` and the contracts said `/api/v1`, so every client call 404'd. One
 * definition, imported everywhere, cannot drift.
 */

/** The prefix every API route sits under. */
export const API_PREFIX = "/api/v1";

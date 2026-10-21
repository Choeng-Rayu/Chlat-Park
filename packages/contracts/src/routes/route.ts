import type { z } from "zod";
import type {
  ZodOpenApiOperationObject,
  ZodOpenApiPathItemObject,
  ZodOpenApiResponseObject,
  ZodOpenApiResponsesObject,
} from "zod-openapi";
import type { PermissionKey } from "../permissions.js";

/**
 * A tiny route-definition layer on top of `zod-openapi`.
 *
 * `zod-openapi@6` has no `createRoute` helper of its own — it exposes
 * `createDocument`, `createRegistry` and `createComponents` — so this module
 * provides the small ergonomic wrapper the route files use:
 *
 * ```ts
 * export const listSitesRoute = createRoute({
 *   method: "get",
 *   path: "/sites",
 *   summary: "List parking sites",
 *   tags: ["sites"],
 *   permissions: ["platform.sites.read"],
 *   query: ListSitesQuerySchema,
 *   responses: { 200: { description: "OK", schema: z.object({ data: z.array(ParkingSiteSchema) }) } },
 * });
 * ```
 *
 * The route object is plain data: it is used to build the OpenAPI document
 * *and* to drive the API's route audit, so the documented surface and the
 * implemented surface cannot drift.
 */

/** The HTTP methods a route may declare. */
export type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

/** A documented response header. */
export interface RouteHeaderDefinition {
  /** What the header carries. */
  description?: string;
  /** The header's JSON Schema. */
  schema?: Record<string, unknown>;
  /** Whether the header is mandatory. */
  required?: boolean;
}

/** A response definition. */
export interface RouteResponseDefinition {
  /** The response description. */
  description: string;
  /** The body schema, when the response has a body. */
  schema?: z.ZodType;
  /** Extra headers to document. */
  headers?: Record<string, RouteHeaderDefinition>;
}

/** The definition of a single API route. */
export interface RouteDefinition {
  /** The HTTP method. */
  method: HttpMethod;
  /** The path, relative to the API prefix, e.g. `/sites/{siteId}`. */
  path: string;
  /** A one-line summary. */
  summary: string;
  /** A longer description. */
  description?: string;
  /** OpenAPI tags, used to group operations in the reference UI. */
  tags: string[];
  /**
   * The permissions the route requires. An empty array marks a public or
   * self-scoped route.
   *
   * The API's route-audit test asserts that every route declares either
   * permissions, an explicit `public: true`, or `selfScoped: true` — deny by
   * default.
   */
  permissions: PermissionKey[];
  /** Marks a route as public. Public routes must appear on the reviewed allowlist. */
  public?: boolean;
  /**
   * Marks a route as self-scoped: it needs an authenticated actor, but the
   * actor's own account is the authorization target, so no catalogue
   * permission applies.
   *
   * `GET /auth/me` is the canonical example — it is how a client learns its
   * own permission list, so requiring a permission to read it would be
   * circular.
   */
  selfScoped?: boolean;
  /** The path parameters. */
  params?: z.ZodObject<z.ZodRawShape>;
  /** The query parameters. */
  query?: z.ZodObject<z.ZodRawShape>;
  /** The request body schema. */
  body?: z.ZodType;
  /** The responses, keyed by status code. */
  responses: Record<string, RouteResponseDefinition>;
  /** Whether the route requires a fresh re-authentication. */
  requiresReauth?: boolean;
  /** Whether the route honours an `Idempotency-Key` header. */
  idempotent?: boolean;
  /** The rate-limit bucket name, when the route has its own bucket. */
  rateLimitBucket?: string;
}

/** A route, with the OpenAPI operation already materialised. */
export interface Route extends RouteDefinition {
  /** The generated OpenAPI operation object. */
  operation: ZodOpenApiOperationObject;
  /** The OpenAPI path-item fragment for this method. */
  pathItem: ZodOpenApiPathItemObject;
}

/**
 * Build a route definition.
 *
 * The returned object carries both the raw definition (for the route audit)
 * and the materialised OpenAPI operation (for the document).
 */
export function createRoute(definition: RouteDefinition): Route {
  const { method, params, query, body, responses, summary, description, tags } = definition;

  const requestParams: {
    path?: z.ZodObject<z.ZodRawShape>;
    query?: z.ZodObject<z.ZodRawShape>;
  } = {};
  if (params) requestParams.path = params;
  if (query) requestParams.query = query;

  const openApiResponses: Record<string, ZodOpenApiResponseObject> = {};

  for (const [status, response] of Object.entries(responses)) {
    openApiResponses[status] = {
      description: response.description,
      ...(response.schema ? { content: { "application/json": { schema: response.schema } } } : {}),
      ...(response.headers
        ? {
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([name, header]) => [
                name,
                {
                  ...(header.description ? { description: header.description } : {}),
                  ...(header.schema ? { schema: header.schema } : {}),
                  ...(header.required ? { required: header.required } : {}),
                },
              ]),
            ),
          }
        : {}),
    };
  }

  const operation: ZodOpenApiOperationObject = {
    summary,
    ...(description ? { description } : {}),
    tags: [...tags],
    ...(Object.keys(requestParams).length > 0 ? { requestParams } : {}),
    ...(body ? { requestBody: { content: { "application/json": { schema: body } } } } : {}),
    responses: openApiResponses as ZodOpenApiResponsesObject,
  };

  return {
    ...definition,
    operation,
    pathItem: { [method]: operation } as ZodOpenApiPathItemObject,
  };
}

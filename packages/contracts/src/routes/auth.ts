import { z } from "zod";
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutRequestSchema,
  MeResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
} from "../schemas/auth.js";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import { createRoute } from "./route.js";

/**
 * Authentication routes.
 *
 * `POST /auth/login` and `POST /auth/refresh` are public — they are how a
 * client obtains credentials. Everything else requires an access token.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };

export const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  summary: "Sign in with an email address and a password",
  description:
    "Issues an access token and a rotating refresh token. Both are also set as HttpOnly cookies. " +
    "A failed attempt always returns AUTH_INVALID_CREDENTIALS, never a hint about which half was wrong.",
  tags: ["auth"],
  permissions: [],
  public: true,
  rateLimitBucket: "login",
  body: LoginRequestSchema,
  responses: {
    "200": { description: "Signed in", schema: LoginResponseSchema },
    "400": errorResponse,
    "401": errorResponse,
    "429": errorResponse,
  },
});

export const refreshRoute = createRoute({
  method: "post",
  path: "/auth/refresh",
  summary: "Rotate the refresh token and mint a new access token",
  description:
    "The presented refresh token is invalidated and a new one is issued. Replaying an old token " +
    "revokes the whole token family.",
  tags: ["auth"],
  permissions: [],
  public: true,
  rateLimitBucket: "refresh",
  body: RefreshRequestSchema,
  responses: {
    "200": { description: "Refreshed", schema: RefreshResponseSchema },
    "401": errorResponse,
    "429": errorResponse,
  },
});

export const logoutRoute = createRoute({
  method: "post",
  path: "/auth/logout",
  summary: "Revoke the refresh token and clear the cookies",
  description:
    "Requires the refresh token, either in the body or in the `chlat_rt` cookie. " +
    "It is not on the public allowlist: an unauthenticated caller has nothing to revoke.",
  tags: ["auth"],
  permissions: [],
  selfScoped: true,
  body: LogoutRequestSchema,
  responses: {
    "204": { description: "Signed out" },
  },
});

export const meRoute = createRoute({
  method: "get",
  path: "/auth/me",
  summary: "Load the actor context and the effective permission list",
  description:
    "Returns the signed-in actor, the permissions resolved at request time, and the sites the " +
    "actor may act within.",
  tags: ["auth"],
  permissions: [],
  selfScoped: true,
  responses: {
    "200": { description: "The actor context", schema: MeResponseSchema },
    "401": errorResponse,
  },
});

export const changePasswordRoute = createRoute({
  method: "post",
  path: "/auth/password",
  summary: "Change the signed-in user's password",
  description: "A sensitive action: it requires a re-authentication newer than 30 minutes.",
  tags: ["auth"],
  permissions: [],
  selfScoped: true,
  requiresReauth: true,
  body: ChangePasswordRequestSchema,
  responses: {
    "204": { description: "Password changed" },
    "400": errorResponse,
    "401": errorResponse,
    "403": errorResponse,
  },
});

/** The path parameters shared by the session-scoped auth routes. */
export const userIdParams = z.object({ userId: UuidSchema });

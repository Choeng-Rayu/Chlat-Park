import { z } from "zod";
import { EmailSchema, IsoDateTimeSchema, UuidSchema } from "./common.js";
import { RoleSchema, ScopeKindSchema } from "./rbac.js";

/**
 * Authentication: staff sign-in, token refresh, and the actor context.
 *
 * Guests never authenticate — they hold an opaque bearer token (a claim token
 * or a ticket token) that carries no personal data. See
 * `specs/features/authentication/`.
 */

/** The body of a login request. */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * The response of a successful login.
 *
 * The tokens are also set as `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
 * They are returned in the body as well so a non-browser client (the API's
 * own tests, a future mobile app) can use them.
 */
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: z.object({
    id: UuidSchema,
    email: EmailSchema.nullable(),
    displayName: z.string().nullable(),
    role: RoleSchema,
    scopeKind: ScopeKindSchema,
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** The body of a refresh request. The refresh token may also be a cookie. */
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/** The response of a successful refresh. The old refresh token is invalidated. */
export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

/** The body of a logout request. */
export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/** The actor context attached to an authenticated request. */
export const ActorContextSchema = z.object({
  userId: UuidSchema,
  role: RoleSchema,
  scopeKind: ScopeKindSchema,
  ownerProfileId: UuidSchema.nullable(),
  guardProfileId: UuidSchema.nullable(),
  /** Bumped on any permission or assignment change; used to invalidate caches. */
  authzVersion: z.number().int().nonnegative(),
});
export type ActorContext = z.infer<typeof ActorContextSchema>;

/** The response of `GET /auth/me`. */
export const MeResponseSchema = z.object({
  user: z.object({
    id: UuidSchema,
    email: EmailSchema.nullable(),
    displayName: z.string().nullable(),
    role: RoleSchema,
    scopeKind: ScopeKindSchema,
  }),
  /** The effective permission list, resolved at request time. */
  permissions: z.array(z.string()),
  /** The sites the actor may act within. */
  siteIds: z.array(UuidSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** The body of a password-change request. */
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12, "A password must be at least 12 characters").max(200),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/** A record of a staff session. */
export const AuthSessionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  lastUsedAt: IsoDateTimeSchema.nullable(),
  expiresAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.nullable(),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

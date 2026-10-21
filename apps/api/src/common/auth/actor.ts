import type { Role, ScopeKind } from "@chlat/contracts";

/**
 * The actor attached to an authenticated request.
 *
 * The actor is the *coarse* layer of the authorization model: it says who the
 * caller is, at what scope, and which version of their grants was current when
 * the token was issued. The *fine* layer — the effective permission set — is
 * resolved per request by the `AuthorizationService`.
 *
 * See `specs/architecture/rbac-design.md` §7 for the two-layer model.
 */
export interface ActorContext {
  /** The user's id. */
  userId: string;
  /** The coarse account role. */
  role: Role;
  /** The primary scope kind. */
  scopeKind: ScopeKind;
  /** The parking-owner profile id, when the actor is an owner. */
  ownerProfileId: string | null;
  /** The security-guard profile id, when the actor is a guard. */
  guardProfileId: string | null;
  /** Bumped on any permission or assignment change. */
  authzVersion: number;
}

/**
 * The access-token payload.
 *
 * The token carries the coarse role and the scope kind only. It never
 * carries the permission list: a permission may be revoked at any moment,
 * and a token that listed its permissions would keep granting them until it
 * expired. The effective set is resolved from the database on every request.
 */
export interface AccessTokenPayload {
  /** The subject — the user's id. */
  sub: string;
  /** The token type. Only `access` is accepted by the API. */
  type: "access";
  /** The coarse role. */
  role: Role;
  /** The primary scope kind. */
  scopeKind: ScopeKind;
  /** The parking-owner profile id. */
  ownerProfileId: string | null;
  /** The security-guard profile id. */
  guardProfileId: string | null;
  /** The grants version at issue time. */
  authzVersion: number;
  /** Issued at (seconds since the epoch). */
  iat?: number;
  /** Expiry (seconds since the epoch). */
  exp?: number;
}

/** The header the actor is attached to on the request. */
export const ACTOR_HEADER = "chlatActor";

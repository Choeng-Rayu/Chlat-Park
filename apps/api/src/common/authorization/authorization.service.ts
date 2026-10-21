import { Injectable } from "@nestjs/common";
import { ROLE_PERMISSIONS, type PermissionKey } from "@chlat/contracts";

import type { ActorContext } from "../auth/actor.js";

/**
 * The authorization service — the single check function.
 *
 * Every role passes through this service. There is no
 * `if (isSuperAdmin) return allow` anywhere: a super admin holds every
 * permission in the catalogue, and that grant set is evaluated by exactly the
 * same code path as a guard's.
 *
 * **Current scope of this foundation.** The effective permission set is
 * derived from the role catalogue in `@chlat/contracts` — the same data the
 * seed script materialises into the `role_permissions` table. The
 * database-backed fine layer (`permissions`, `role_permissions`,
 * `user_permission_grants` + the `authzVersion` cache described in
 * `specs/architecture/rbac-design.md` §7) is the next task for the backend
 * developer; the interface below is the seam where it plugs in.
 */
@Injectable()
export class AuthorizationService {
  /**
   * The effective permission set of an actor.
   *
   * The set is cached per `(userId, authzVersion)` for the lifetime of the
   * process. The cache key includes the version, so a version bump
   * invalidates every cached entry for that user at once.
   */
  private readonly cache = new Map<string, ReadonlySet<PermissionKey>>();

  /**
   * The permissions an actor effectively holds.
   *
   * @internal
   */
  effectivePermissions(actor: ActorContext): ReadonlySet<PermissionKey> {
    const key = `${actor.userId}:${actor.authzVersion}`;
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const permissions = new Set<PermissionKey>(ROLE_PERMISSIONS[actor.role] ?? []);
    this.cache.set(key, permissions);

    return permissions;
  }

  /**
   * Does the actor hold the given permission?
   *
   * The answer is *what*, never *where*. The scope check is a separate step
   * (`ScopeResolver`), because a permission without a scope is meaningless
   * and a scope without a permission is meaningless — both are required for
   * an allow.
   */
  hasPermission(actor: ActorContext, permission: PermissionKey): boolean {
    return this.effectivePermissions(actor).has(permission);
  }

  /**
   * Does the actor hold **every** one of the given permissions?
   *
   * A route declaring two permissions requires both. The guard never grants
   * on "any of" — a route that asks for `platform.analytics.read` *and*
   * `platform.audit.export` means both.
   */
  hasAllPermissions(actor: ActorContext, permissions: readonly PermissionKey[]): boolean {
    if (permissions.length === 0) {
      return false;
    }

    const effective = this.effectivePermissions(actor);
    return permissions.every((permission) => effective.has(permission));
  }

  /** Drop the cached permission set of one actor. */
  invalidate(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /** Drop every cached permission set. */
  invalidateAll(): void {
    this.cache.clear();
  }
}

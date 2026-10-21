import { z } from "zod";
import { PERMISSIONS, PERMISSION_KEYS, ROLES } from "../permissions.js";
import { EmailSchema, IsoDateTimeSchema, PaginationQuerySchema, UuidSchema } from "./common.js";

/**
 * RBAC-facing schemas.
 *
 * The permission *keys* come from the catalogue in `../permissions.ts` — this
 * module never re-declares them, so the two can never drift apart.
 */

/** A permission key, as a Zod enum derived from the catalogue. */
export const PermissionKeySchema = z.enum(
  PERMISSION_KEYS as unknown as [string, ...string[]],
) as z.ZodType<(typeof PERMISSION_KEYS)[number]>;
export type PermissionKeyFromSchema = z.infer<typeof PermissionKeySchema>;

/** A role, as a Zod enum derived from the catalogue. */
export const RoleSchema = z.enum(ROLES as unknown as [string, ...string[]]) as z.ZodType<
  (typeof ROLES)[number]
>;

/** The status of a user account. */
export const UserStatusSchema = z.enum(["active", "suspended", "pending"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** The scope kind recorded on a user account. */
export const ScopeKindSchema = z.enum(["platform", "owned", "assigned", "self"]);
export type ScopeKind = z.infer<typeof ScopeKindSchema>;

/** A user account, as seen by an administrator. Never carries `passwordHash`. */
export const UserSchema = z.object({
  id: UuidSchema,
  email: EmailSchema.nullable(),
  displayName: z.string().trim().min(1).max(120).nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
  scopeKind: ScopeKindSchema,
  authzVersion: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

/** A permission grant, with its metadata. */
export const PermissionSchema = z.object({
  key: PermissionKeySchema,
  description: z.string(),
  scopeKind: z.enum(["platform", "site", "self", "public"]),
  category: z.enum(["platform", "site", "account", "public"]),
});
export type Permission = z.infer<typeof PermissionSchema>;

/** The whole catalogue, as a list — for the admin console. */
export const PermissionCatalogueSchema = z.object({
  permissions: z.array(PermissionSchema),
});
export type PermissionCatalogue = z.infer<typeof PermissionCatalogueSchema>;

/** The effect of a per-user permission override. */
export const GrantEffectSchema = z.enum(["GRANT", "REVOKE"]);

/** A per-user permission override. A `REVOKE` always wins over a role grant. */
export const PermissionGrantSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  permissionKey: PermissionKeySchema,
  effect: GrantEffectSchema,
  expiresAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

/** The body of a per-user grant request. */
export const GrantPermissionRequestSchema = z.object({
  permissionKey: PermissionKeySchema,
  effect: GrantEffectSchema,
  expiresAt: z.coerce.date().nullable().default(null),
});
export type GrantPermissionRequest = z.infer<typeof GrantPermissionRequestSchema>;

/** The effective permissions of an actor, resolved at request time. */
export const EffectivePermissionsSchema = z.object({
  role: RoleSchema,
  permissions: z.array(PermissionKeySchema),
});
export type EffectivePermissions = z.infer<typeof EffectivePermissionsSchema>;

/** The list query for the user collection. */
export const ListUsersQuerySchema = PaginationQuerySchema.extend({
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

/** The body of a user-suspension request. */
export const SuspendUserRequestSchema = z.object({
  reason: z.string().trim().min(1, "A suspension requires a reason").max(500),
});
export type SuspendUserRequest = z.infer<typeof SuspendUserRequestSchema>;

/**
 * Build the permission catalogue payload.
 *
 * Exported so the API and the seed script render the same list.
 */
export function permissionCatalogue(): PermissionCatalogue {
  return {
    permissions: PERMISSION_KEYS.map((key) => {
      const definition = PERMISSIONS[key];
      return {
        key,
        description: definition.description,
        scopeKind: definition.scopeKind,
        category: definition.category,
      };
    }),
  };
}

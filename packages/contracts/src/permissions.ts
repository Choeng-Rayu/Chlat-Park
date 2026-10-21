/**
 * The permission catalogue — the single source of truth for "what may be done".
 *
 * Every consumer reads this file: the API resolves grants from it, the web app
 * hides actions it cannot perform, the seed script materialises it into the
 * `permissions` / `role_permissions` tables, and the CI route audit asserts
 * that every `@RequirePermissions(...)` string is a known key.
 *
 * The `satisfies` clause makes a typo in a permission string a compile error;
 * `as const` makes the keys a literal union.
 *
 * Rules encoded here (see `specs/architecture/rbac-design.md`):
 *   - A permission answers WHAT. Scope answers WHERE. Both are needed for an allow.
 *   - Super admin is a wider scope, not a bypass.
 *   - Deny by default: a route with no permission metadata and no public
 *     marker returns 403.
 */

/**
 * The *catalogue* scope of a permission — what kind of thing it acts on.
 *
 * This is documentation + seeding metadata. The *actor* scope kinds
 * (`platform | owned | assigned | self`) are resolved at request time by the
 * API's scope resolver and are deliberately not encoded here.
 */
export type PermissionScopeKind = "platform" | "site" | "self" | "public";

/** The coarse role a user account holds. */
export type Role = "super_admin" | "owner" | "guard" | "user";

/** The permission groups used for grouping in the admin console. */
export type PermissionCategory = "platform" | "site" | "account" | "public";

interface PermissionDefinition {
  /** Human-readable purpose, surfaced in the admin console and the audit log. */
  readonly description: string;
  /** What kind of scope the permission acts within. */
  readonly scopeKind: PermissionScopeKind;
  /** The category the permission belongs to. */
  readonly category: PermissionCategory;
}

/**
 * The catalogue itself.
 *
 * Keys are dot-notation: `<category>.<resource>.<action>`.
 */
export const PERMISSIONS = {
  // --- platform.* — super admin only -------------------------------------
  "platform.sites.read": {
    description: "List and read any parking site across the platform",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.sites.create": {
    description: "Create a parking site for an owner",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.sites.update": {
    description: "Modify any site's name, address, timezone, currency or status",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.sites.deactivate": {
    description: "Deactivate (soft-delete) a site; blocks new sessions",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.owners.read": {
    description: "List and read parking owners",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.owners.create": {
    description: "Create a parking owner account and profile",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.owners.suspend": {
    description: "Suspend an owner: blocks login, keeps data for audit",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.users.read": {
    description: "List and read user accounts across the platform",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.users.suspend": {
    description: "Suspend or reinstate a user account",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.staff.read": {
    description: "List guards, owners and staff across the platform",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.revenue.read": {
    description: "Read platform revenue aggregates (collected / exempt / voided / failed)",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.analytics.read": {
    description: "Read adoption and funnel analytics",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.payments.read": {
    description: "Read payment records across the platform",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.audit.read": {
    description: "Read audit log entries across the platform",
    scopeKind: "platform",
    category: "platform",
  },
  "platform.audit.export": {
    description: "Export audit log entries to a file",
    scopeKind: "platform",
    category: "platform",
  },

  // --- site.* — site-scoped ----------------------------------------------
  "site.settings.read": {
    description: "Read the site's settings (timezone, currency, payment methods, claim TTL)",
    scopeKind: "site",
    category: "site",
  },
  "site.settings.update": {
    description: "Change the site's settings",
    scopeKind: "site",
    category: "site",
  },
  "site.staff.read": {
    description: "List the site's guards and their assignments",
    scopeKind: "site",
    category: "site",
  },
  "site.staff.invite": {
    description: "Invite a guard to the site",
    scopeKind: "site",
    category: "site",
  },
  "site.staff.deactivate": {
    description: "Deactivate a guard's assignment to the site",
    scopeKind: "site",
    category: "site",
  },
  "site.pricing.read": {
    description: "Read the site's pricing policies and versions",
    scopeKind: "site",
    category: "site",
  },
  "site.pricing.manage": {
    description: "Create a pricing policy version, set the effective policy, deactivate a policy",
    scopeKind: "site",
    category: "site",
  },
  "site.sessions.read": {
    description: "List and read the site's parking sessions",
    scopeKind: "site",
    category: "site",
  },
  "site.sessions.create": {
    description: "Create a parking session (entry)",
    scopeKind: "site",
    category: "site",
  },
  "site.sessions.activate": {
    description: "Manually activate a never-claimed PENDING_CLAIM session",
    scopeKind: "site",
    category: "site",
  },
  "site.sessions.cancel": {
    description: "Cancel a PENDING_CLAIM session",
    scopeKind: "site",
    category: "site",
  },
  "site.entry_qr.issue": {
    description: "Issue an entry QR for a session",
    scopeKind: "site",
    category: "site",
  },
  "site.entry_qr.reissue": {
    description: "Reissue (rotate) the entry QR of a pending session",
    scopeKind: "site",
    category: "site",
  },
  "site.ticket.verify": {
    description: "Verify a ticket and read the exit details",
    scopeKind: "site",
    category: "site",
  },
  "site.exit.request": {
    description: "Move a session to EXIT_PENDING",
    scopeKind: "site",
    category: "site",
  },
  "site.exit.complete": {
    description: "Complete the exit of a session",
    scopeKind: "site",
    category: "site",
  },
  "site.payments.record": {
    description: "Record a manual payment result",
    scopeKind: "site",
    category: "site",
  },
  "site.payments.exempt": {
    description: "Grant a fee exemption with a reason",
    scopeKind: "site",
    category: "site",
  },
  "site.review.open": {
    description: "Open a manual review case",
    scopeKind: "site",
    category: "site",
  },
  "site.review.resolve": {
    description: "Resolve a manual review case (with an audited reason)",
    scopeKind: "site",
    category: "site",
  },
  "site.reports.read": {
    description: "Read the site's reports (sessions, payments, totals) with filters",
    scopeKind: "site",
    category: "site",
  },
  "site.audit.read": {
    description: "Read audit log entries for the site",
    scopeKind: "site",
    category: "site",
  },

  // --- account.* — self-scoped -------------------------------------------
  "account.tickets.read": {
    description: "Read the tickets linked to the caller's own account",
    scopeKind: "self",
    category: "account",
  },
  "account.telegram.link": {
    description: "Link or unlink a Telegram identity to the caller's account",
    scopeKind: "self",
    category: "account",
  },

  // --- public -------------------------------------------------------------
  "ticket.claim": {
    description: "Claim an entry QR and receive an e-ticket",
    scopeKind: "public",
    category: "public",
  },
} as const satisfies Record<string, PermissionDefinition>;

/** A literal union of every permission key in the catalogue. */
export type PermissionKey = keyof typeof PERMISSIONS;

/** Every permission key, in catalogue order. */
export const PERMISSION_KEYS = Object.freeze(
  Object.keys(PERMISSIONS) as PermissionKey[],
) as readonly PermissionKey[];

/** The categories, in display order. */
export const PERMISSION_CATEGORIES = Object.freeze([
  "platform",
  "site",
  "account",
  "public",
] as const satisfies readonly PermissionCategory[]);

/**
 * The permissions granted to each role by default.
 *
 * These are the seeds of the `role_permissions` table. Per-user overrides
 * (`user_permission_grants`) are applied on top: a `REVOKE` always wins over
 * a role grant.
 */
export const ROLE_PERMISSIONS = {
  /**
   * The super admin holds every permission in the catalogue. It is still
   * evaluated through the same check path as every other role — a wider
   * scope, not a bypass.
   */
  super_admin: PERMISSION_KEYS,

  /**
   * An owner administers the sites they own: settings, staff, pricing,
   * reports, audit, and the fee-exemption / review-resolution actions.
   */
  owner: [
    "site.settings.read",
    "site.settings.update",
    "site.staff.read",
    "site.staff.invite",
    "site.staff.deactivate",
    "site.pricing.read",
    "site.pricing.manage",
    "site.sessions.read",
    "site.sessions.create",
    "site.sessions.activate",
    "site.sessions.cancel",
    "site.entry_qr.issue",
    "site.entry_qr.reissue",
    "site.ticket.verify",
    "site.exit.request",
    "site.exit.complete",
    "site.payments.record",
    "site.payments.exempt",
    "site.review.open",
    "site.review.resolve",
    "site.reports.read",
    "site.audit.read",
    "account.tickets.read",
    "account.telegram.link",
  ],

  /**
   * A guard operates the site day to day: create sessions, issue entry QR,
   * verify tickets, authorise exits, record payments, open reviews.
   *
   * `site.payments.exempt` and `site.review.resolve` are deliberately absent
   * for guards — the RBAC design grants them to a manager, and the spec
   * requires a reason when a guard performs them.
   */
  guard: [
    "site.sessions.read",
    "site.sessions.create",
    "site.sessions.activate",
    "site.sessions.cancel",
    "site.entry_qr.issue",
    "site.entry_qr.reissue",
    "site.ticket.verify",
    "site.exit.request",
    "site.exit.complete",
    "site.payments.record",
    "site.review.open",
  ],

  /**
   * A registered owner sees only their own resources.
   */
  user: ["account.tickets.read", "account.telegram.link"],
} as const satisfies Record<Role, readonly PermissionKey[]>;

/**
 * The site role on a `guard_site_assignments` row adds permissions on top of
 * the guard set.
 *
 * `manager` is not a coarse account role — it is a per-assignment site role.
 * The seed script materialises `ROLE_PERMISSIONS.guard` plus the delta below
 * into `role_permissions` for the manager site role.
 */
export const SITE_ROLE_EXTRA_PERMISSIONS = {
  guard: [] as const,
  manager: [
    "site.settings.read",
    "site.settings.update",
    "site.staff.read",
    "site.staff.invite",
    "site.staff.deactivate",
    "site.pricing.read",
    "site.pricing.manage",
    "site.reports.read",
    "site.audit.read",
    "site.payments.exempt",
    "site.review.resolve",
  ],
} as const satisfies Record<string, readonly PermissionKey[]>;

/** Every role, in display order. */
export const ROLES = Object.freeze([
  "super_admin",
  "owner",
  "guard",
  "user",
] as const satisfies readonly Role[]);

/** A type guard: is the given string a known permission key? */
export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value);
}

/** A type guard: is the given string a known role? */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The permissions a role holds.
 *
 * Returns a fresh array so a caller cannot mutate the frozen catalogue.
 */
export function permissionsForRole(role: Role): PermissionKey[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** The metadata for a single permission. */
export function describePermission(key: PermissionKey): PermissionDefinition {
  return PERMISSIONS[key];
}

import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  ROLES,
  SITE_ROLE_EXTRA_PERMISSIONS,
  isPermissionKey,
  isRole,
  permissionsForRole,
} from "./permissions.js";

/**
 * The permission catalogue is the backbone of the authorization model, so it
 * gets a test that would fail loudly if anyone typos a key or drifts a role.
 */

describe("the permission catalogue", () => {
  it("exposes every key exactly once", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("uses dot notation", () => {
    for (const key of PERMISSION_KEYS) {
      // `<category>.<resource>.<action>`, except for the public `ticket.claim`
      // which has no resource segment.
      expect(key, `${key} must be dot-notation`).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it("covers all four categories", () => {
    const categories = new Set(Object.values(PERMISSIONS).map((p) => p.category));
    expect([...categories].sort()).toEqual([...PERMISSION_CATEGORIES].sort());
  });

  it("gives every permission a description and a scope kind", () => {
    for (const key of PERMISSION_KEYS) {
      const definition = PERMISSIONS[key];
      expect(definition.description.length, `${key} needs a description`).toBeGreaterThan(0);
      expect(["platform", "site", "self", "public"]).toContain(definition.scopeKind);
    }
  });

  it("recognises known keys and rejects unknown ones", () => {
    expect(isPermissionKey("site.exit.complete")).toBe(true);
    expect(isPermissionKey("site.exit.completes")).toBe(false);
    expect(isPermissionKey("toString")).toBe(false);
  });
});

describe("the role map", () => {
  it("grants the super admin every permission", () => {
    expect(ROLE_PERMISSIONS.super_admin).toEqual(PERMISSION_KEYS);
  });

  it("only grants known permissions", () => {
    for (const role of ROLES) {
      for (const key of ROLE_PERMISSIONS[role]) {
        expect(isPermissionKey(key), `${role} holds unknown permission ${key}`).toBe(true);
      }
    }
  });

  it("keeps the super admin a superset of every other role", () => {
    for (const role of ROLES) {
      if (role === "super_admin") continue;
      for (const key of ROLE_PERMISSIONS[role]) {
        expect(PERMISSION_KEYS).toContain(key);
      }
    }
  });

  it("does not let a guard exempt a fee or resolve a review", () => {
    expect(ROLE_PERMISSIONS.guard).not.toContain("site.payments.exempt");
    expect(ROLE_PERMISSIONS.guard).not.toContain("site.review.resolve");
  });

  it("gives an owner the management permissions a guard lacks", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("site.payments.exempt");
    expect(ROLE_PERMISSIONS.owner).toContain("site.review.resolve");
    expect(ROLE_PERMISSIONS.owner).toContain("site.pricing.manage");
  });

  it("gives a registered user only self-scoped permissions", () => {
    for (const key of ROLE_PERMISSIONS.user) {
      expect(PERMISSIONS[key].scopeKind).toBe("self");
    }
  });

  it("returns a fresh array so a caller cannot mutate the catalogue", () => {
    const first = permissionsForRole("guard");
    first.push("site.payments.exempt");
    expect(permissionsForRole("guard")).not.toContain("site.payments.exempt");
  });

  it("recognises known roles", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("administrator")).toBe(false);
  });
});

describe("the site-role delta", () => {
  it("adds the manager permissions on top of the guard set", () => {
    const manager = new Set([...ROLE_PERMISSIONS.guard, ...SITE_ROLE_EXTRA_PERMISSIONS.manager]);
    for (const key of SITE_ROLE_EXTRA_PERMISSIONS.manager) {
      expect(manager.has(key)).toBe(true);
    }
  });

  it("adds no unknown permissions", () => {
    for (const key of SITE_ROLE_EXTRA_PERMISSIONS.manager) {
      expect(isPermissionKey(key)).toBe(true);
    }
  });
});

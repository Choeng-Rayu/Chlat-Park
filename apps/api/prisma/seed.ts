/**
 * The seed script.
 *
 * It materialises the permission catalogue and the role grants from
 * `@chlat/contracts` into the database. The catalogue in the package is the
 * **source of truth**; the `permissions` and `role_permissions` tables are
 * its projection. The script is idempotent: running it twice leaves the
 * database in the same state.
 *
 * It also creates the first super admin, so a fresh environment has somebody
 * who can sign in to the admin console. The password comes from the
 * environment; it is never hard-coded and never printed.
 *
 * Run it with:  pnpm db:seed
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSIONS, PERMISSION_KEYS, ROLE_PERMISSIONS, ROLES, type Role } from "@chlat/contracts";

import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client.js";

/**
 * The generated Prisma client.
 *
 * The client is *generated* — `prisma generate` writes TypeScript to
 * `src/generated/prisma`, and the API's build compiles it to
 * `dist/generated/prisma`. The seed runs against the **compiled** output,
 * because the generated sources import each other with `.js` extensions that
 * Node's type-stripping cannot resolve from TypeScript source.
 *
 * The import is dynamic, and the specifier is built at runtime, so
 * TypeScript does not try to resolve a declaration file for the compiled
 * JavaScript. The *type* comes from the generated source; the *value* comes
 * from the compiled file.
 */
const { PrismaClient } = (await import(
  new URL("../dist/generated/prisma/client.js", import.meta.url).href
)) as unknown as { PrismaClient: typeof PrismaClientType };

const connectionString = process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "The seed script needs DATABASE_URL (or DIRECT_DATABASE_URL) in the environment.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * The scope kind a permission acts within.
 *
 * The catalogue's `scopeKind` is the *catalogue* scope (`platform | site |
 * self | public`), which is exactly the vocabulary the `permissions` table
 * stores.
 */
function scopeKindFor(key: keyof typeof PERMISSIONS): "platform" | "site" | "self" | "public" {
  return PERMISSIONS[key].scopeKind;
}

/** The category a permission belongs to. */
function categoryFor(key: keyof typeof PERMISSIONS): string {
  return PERMISSIONS[key].category;
}

async function seedPermissions(): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        description: PERMISSIONS[key].description,
        scopeKind: scopeKindFor(key),
        category: categoryFor(key),
      },
      update: {
        description: PERMISSIONS[key].description,
        scopeKind: scopeKindFor(key),
        category: categoryFor(key),
      },
    });
  }

  console.log(`[seed] ${PERMISSION_KEYS.length} permissions`);
}

async function seedRolePermissions(): Promise<void> {
  let count = 0;

  for (const role of ROLES) {
    for (const key of ROLE_PERMISSIONS[role as Role]) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role: role as Role, permissionKey: key } },
        create: { role: role as Role, permissionKey: key },
        update: {},
      });
      count += 1;
    }
  }

  console.log(`[seed] ${count} role permissions across ${ROLES.length} roles`);
}

/**
 * Create the first super admin.
 *
 * The email and the password come from the environment. The password is
 * hashed with Argon2id and is never logged.
 */
async function seedSuperAdmin(): Promise<void> {
  const email = process.env["SEED_ADMIN_EMAIL"];
  const password = process.env["SEED_ADMIN_PASSWORD"];

  if (!email || !password) {
    console.log(
      "[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set — no super admin created.",
    );
    return;
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters long.");
  }

  const argon2 = (await import("argon2")).default;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      displayName: "Super Admin",
      role: "super_admin",
      status: "active",
      scopeKind: "platform",
    },
    update: {
      passwordHash,
      role: "super_admin",
      status: "active",
      scopeKind: "platform",
    },
  });

  console.log(`[seed] super admin "${email}" is ready`);
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedRolePermissions();
  await seedSuperAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("[seed] Failed:", error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

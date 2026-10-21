-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'owner', 'guard', 'user');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'pending');

-- CreateEnum
CREATE TYPE "ScopeKind" AS ENUM ('platform', 'owned', 'assigned', 'self');

-- CreateEnum
CREATE TYPE "PermissionScopeKind" AS ENUM ('platform', 'site', 'self', 'public');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "scopeKind" "ScopeKind" NOT NULL DEFAULT 'self',
    "authzVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scopeKind" "PermissionScopeKind" NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" "UserRole" NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permissionKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "role_permissions_permissionKey_idx" ON "role_permissions"("permissionKey");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

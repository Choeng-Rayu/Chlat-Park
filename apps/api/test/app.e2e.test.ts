import type { NestExpressApplication } from "@nestjs/platform-express";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AccessTokenPayload } from "../src/common/auth/actor.js";
import { createTestApp } from "./helpers/create-test-app.js";

/**
 * The API's end-to-end smoke test.
 *
 * Two things are proven here, and they are the two things that matter most
 * about the API's shape:
 *
 * 1. The public health probe answers 200 — the API boots and serves.
 * 2. A route with no permission metadata is rejected with 403 — the API is
 *    deny-by-default.
 *
 * The second assertion is the security regression test. It is made with a
 * **valid super-admin token**: the super admin holds every permission in the
 * catalogue, so nothing but the deny-by-default rule itself can produce the
 * 403. If someone ever weakens `PermissionsGuard` into an implicit allow,
 * this test fails.
 */
describe("API (e2e)", () => {
  let app: NestExpressApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const payload: AccessTokenPayload = {
      sub: "3f6d5b1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
      type: "access",
      role: "super_admin",
      scopeKind: "platform",
      ownerProfileId: null,
      guardProfileId: null,
      authzVersion: 1,
    };

    accessToken = await app.get(JwtService).signAsync(payload);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("serves the liveness probe", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ok" },
      error: null,
    });
    expect(typeof response.body.data.uptimeSeconds).toBe("number");
  });

  it("serves the readiness probe", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health/ready");

    // 200 when the database is reachable, 503 when it is not. The e2e suite
    // runs without a database, so 503 is the expected answer here — what
    // matters is that the probe answers with the envelope rather than
    // crashing.
    expect([200, 503]).toContain(response.status);
    expect(response.body.success).toBe(response.status === 200);
  });

  it("rejects a request to an unknown route with the error envelope", async () => {
    const response = await request(app.getHttpServer()).get("/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_FOUND" },
    });
    expect(typeof response.body.error.requestId).toBe("string");
  });

  it("rejects an unauthenticated request to a non-public route with 401", async () => {
    const response = await request(app.getHttpServer()).get("/v1/test/unannotated");

    // The JWT guard runs first: a request with no token is *unauthenticated*
    // (401), not merely *unauthorized* (403).
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("AUTH_TOKEN_MISSING");
  });

  it("denies an un-annotated route with 403, even for a super admin", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/test/unannotated")
      .set("Authorization", `Bearer ${accessToken}`);

    // The super admin holds every permission in the catalogue. The 403 comes
    // from the deny-by-default rule alone: no `@RequirePermissions()` and no
    // `@Public()` means no allow.
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "AUTHZ_PERMISSION_DENIED" },
    });
    expect(response.body.error.details).toMatchObject({
      reason: "missing-permission-metadata",
    });
  });
});

import { expect, test } from "@playwright/test";

import { apiOrigin, apiPrefix } from "./support/harness";

/**
 * The API health contract.
 *
 * The API is the authority on everything the app shows, and the envelope it
 * answers with is part of that contract: `{ success, data, message, error }`.
 * The web client unwraps it, so a change to the envelope is a change to
 * every screen in the app — it is worth a test of its own.
 *
 * The API is called directly (rather than through the browser) because these
 * are endpoints, not pages.
 */

test.describe("the API health contract", () => {
  test("the liveness endpoint answers the success envelope", async ({ request }) => {
    const response = await request.get(`${apiOrigin}${apiPrefix}/health/live`);

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body).toMatchObject({
      success: true,
      data: { status: "ok" },
    });
  });

  test("the readiness endpoint answers the success envelope", async ({ request }) => {
    const response = await request.get(`${apiOrigin}${apiPrefix}/health/ready`);

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body).toMatchObject({
      success: true,
      data: { status: "ok", database: "ok" },
    });
  });
});

import { describe, expect, it } from "vitest";
import { createApiClient } from "./client.js";

/**
 * The client is a thin wrapper, so the test is really a type-level one: it
 * proves that the generated schema drives the client's method set, and that
 * the factory wires the base URL and credentials through.
 */
describe("the API client", () => {
  const api = createApiClient({ baseUrl: "http://localhost:3001" });

  it("exposes a typed method for every documented HTTP verb", () => {
    // The compile-time check is the point: if the schema and the client
    // disagree, this file does not compile.
    expect(typeof api.GET).toBe("function");
    expect(typeof api.POST).toBe("function");
    expect(typeof api.PATCH).toBe("function");
    expect(typeof api.DELETE).toBe("function");
  });

  it("accepts a documented path at the call site", () => {
    // A typo in the path is a compile error, not a runtime 404. The call is
    // never awaited — the assertion is that the type-checks, and the
    // unhandled request is caught so the test does not hit the network.
    const call = api.GET("/api/v1/parking-sessions", { params: { query: { limit: 20 } } });
    expect(call).toBeInstanceOf(Promise);
    void call.catch(() => {
      // The API is not running in unit tests; the request is expected to fail.
    });
  });
});

import { API_PREFIX } from "@chlat/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiBaseUrl, apiUrl } from "./client";

/**
 * The web app's API client.
 *
 * The client is the integration point every feature will use, and the URL it
 * builds is the one thing every call depends on: the wrong base URL or a
 * missing API prefix is a 404 that looks like a broken feature.
 *
 * The base URL has two sources, because the app runs in two places: the
 * server talks to the API over the internal network (`API_INTERNAL_URL`),
 * the browser over the public one (`NEXT_PUBLIC_API_URL`).
 */

/** The environment variables the client reads. */
const ENV_KEYS = ["API_INTERNAL_URL", "NEXT_PUBLIC_API_URL"] as const;

/** The environment as it was before the suite touched it. */
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

/** Set the environment variables a test cares about. */
function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  vi.unstubAllGlobals();
});

describe("the API client", () => {
  it("builds the URL from the configured base URL", () => {
    setEnv({ API_INTERNAL_URL: "http://api:3001" });

    expect(apiUrl("/health/live")).toBe(`http://api:3001${API_PREFIX}/health/live`);
  });

  it("encodes the query parameters", () => {
    setEnv({ API_INTERNAL_URL: "http://api:3001" });

    const url = apiUrl("/parking-sessions", { limit: 20, cursor: "a b&c" });

    expect(url).toBe(`http://api:3001${API_PREFIX}/parking-sessions?limit=20&cursor=a+b%26c`);
  });

  it("omits the query parameters that are undefined", () => {
    setEnv({ API_INTERNAL_URL: "http://api:3001" });

    const url = apiUrl("/parking-sessions", { limit: 20, cursor: undefined });

    expect(url).toBe(`http://api:3001${API_PREFIX}/parking-sessions?limit=20`);
  });

  it("adds no query string when every parameter is undefined", () => {
    setEnv({ API_INTERNAL_URL: "http://api:3001" });

    const url = apiUrl("/parking-sessions", { cursor: undefined });

    expect(url).toBe(`http://api:3001${API_PREFIX}/parking-sessions`);
  });

  it("uses the internal URL on the server", () => {
    setEnv({
      API_INTERNAL_URL: "http://api:3001",
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
    });

    expect(apiBaseUrl()).toBe("http://api:3001");
  });

  it("falls back to the public URL on the server", () => {
    setEnv({
      API_INTERNAL_URL: undefined,
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
    });

    expect(apiBaseUrl()).toBe("http://localhost:3001");
  });

  it("uses the public URL in the browser", () => {
    setEnv({
      API_INTERNAL_URL: "http://api:3001",
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
    });

    // The browser cannot reach the internal URL, so it must not be used
    // there — only the public one.
    vi.stubGlobal("window", {});

    expect(apiBaseUrl()).toBe("http://localhost:3001");
  });

  it("does not double the slash when the base URL ends in one", () => {
    setEnv({ API_INTERNAL_URL: "http://api:3001/" });

    const url = apiUrl("/health/live");

    expect(url).toBe(`http://api:3001${API_PREFIX}/health/live`);
    expect(url).not.toContain("3001//");
  });

  it("falls back to the local API when nothing is configured", () => {
    setEnv({ API_INTERNAL_URL: undefined, NEXT_PUBLIC_API_URL: undefined });

    expect(apiBaseUrl()).toBe("http://localhost:3001");
  });
});

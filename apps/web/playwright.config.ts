import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium, defineConfig, devices } from "@playwright/test";

/**
 * The Playwright configuration for the Chlat-Park web app.
 *
 * ## What this suite covers
 *
 * The domain features — parking sessions, the entry QR, the ticket claim,
 * the exit verification and the payments — are **not implemented yet**: the
 * web pages are placeholders and the API only answers `/health/live` and
 * `/health/ready`. The suite therefore covers what exists today (the app
 * shell, the locale routing, the placeholder pages and the API health
 * contract), and `e2e/README.md` records the domain scenarios that are
 * still blocked and which feature has to land first.
 */

/** The web app's origin. Overridable so CI can point the suite at its own stack. */
const baseURL = process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:3000";

/**
 * Where Playwright keeps its browsers.
 *
 * `PLAYWRIGHT_BROWSERS_PATH` wins when it is set; otherwise the platform
 * default is used.
 */
function browsersCacheDir(): string {
  const configured = process.env["PLAYWRIGHT_BROWSERS_PATH"];

  if (configured) {
    return configured;
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "ms-playwright");
  }

  if (process.platform === "win32") {
    return join(homedir(), "AppData", "Local", "ms-playwright");
  }

  return join(homedir(), ".cache", "ms-playwright");
}

/**
 * The chromium binary to launch, or `undefined` to let Playwright pick.
 *
 * Playwright pins one chromium revision per release (1.64.1 wants 1248). On a
 * machine whose cache holds a *different* revision, the default launch
 * aborts with "Executable doesn't exist" and the only remedy is a download.
 * So the pinned revision is used whenever it is installed, and otherwise the
 * newest chromium in the cache is used instead — the suite then runs against
 * a browser that is already on the machine, with nothing downloaded.
 *
 * `E2E_CHROMIUM_PATH` overrides both.
 */
function resolveChromium(): string | undefined {
  const override = process.env["E2E_CHROMIUM_PATH"];

  if (override) {
    return override;
  }

  // The revision Playwright pins. When it is installed, Playwright's own
  // default is exactly right and nothing has to be overridden.
  if (existsSync(chromium.executablePath())) {
    return undefined;
  }

  const cacheDir = browsersCacheDir();

  if (!existsSync(cacheDir)) {
    return undefined;
  }

  const revisions = readdirSync(cacheDir)
    .map((entry) => /^chromium-(\d+)$/.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ dir: join(cacheDir, match[0] as string), revision: Number(match[1]) }))
    .sort((left, right) => right.revision - left.revision);

  for (const { dir } of revisions) {
    // The layout changed over the revisions: "chrome-linux" before 1.49,
    // "chrome-linux64" after it.
    for (const layout of ["chrome-linux64", "chrome-linux"]) {
      const binary = join(dir, layout, "chrome");

      if (existsSync(binary)) {
        return binary;
      }
    }
  }

  return undefined;
}

/**
 * The chromium executable, if one had to be resolved.
 *
 * `undefined` means "use Playwright's default".
 */
const chromiumPath = resolveChromium();

/**
 * `reuseExistingServer` is a `webServer` option in Playwright's types, and
 * this config has no `webServer` block — see the note below. The value is
 * kept here as the single switch that says which stack the suite talks to:
 * locally the running compose stack is reused as-is, in CI the workflow
 * starts a stack of its own before the suite runs.
 */
const composeManaged = {
  reuseExistingServer: !process.env["CI"],
};

export default defineConfig({
  testDir: "./e2e",

  // There is deliberately **no `webServer` block**: the whole stack
  // (Postgres, the API and the web app) is managed by docker compose, not
  // by Playwright. `docker compose up -d` owns the lifecycle, so Playwright
  // only ever talks to an already-running app. The CI workflow brings the
  // same stack up before it runs this suite.
  ...composeManaged,

  // The failures are worth a second look on CI, where the machine is shared
  // and slower than a developer laptop.
  retries: process.env["CI"] ? 2 : 0,

  // A focused test is worse than no test: `.only` must never reach CI.
  forbidOnly: Boolean(process.env["CI"]),

  fullyParallel: true,

  // One worker on CI: the suite talks to one stack, and a single worker keeps
  // the failure output in a readable order.
  workers: process.env["CI"] ? 1 : undefined,

  // `list` while developing, the GitHub reporter (plus `list`, so the raw
  // log stays readable) on CI.
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],

  // A page that never answers is a failure, not a hang.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,

    // The evidence: a trace and a screenshot of the failure, kept only when
    // something actually broke.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",

    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },

  projects: [
    {
      name: "chromium",
      // Only chromium: the firefox and webkit builds are not installed, and
      // downloading them is not worth the CI disk for a smoke suite.
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

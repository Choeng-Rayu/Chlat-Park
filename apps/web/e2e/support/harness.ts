import type { Page } from "@playwright/test";

/**
 * The shared helpers for the e2e suite.
 *
 * They are deliberately black-box: the suite drives the app the way a person
 * would (navigate, look, click) and asserts on what is rendered, never on
 * the internals of the components.
 */

/**
 * The API's origin.
 *
 * The suite talks to the API directly — the health contract is part of the
 * product's public surface, so it is worth a test of its own. The origin is
 * an environment variable so the same suite runs against the local compose
 * stack and against the stack the CI workflow starts.
 */
export const apiOrigin = process.env["E2E_API_URL"] ?? "http://127.0.0.1:3001";

/**
 * The API's global prefix.
 *
 * The source of truth is `API_PREFIX` in `@chlat/contracts`. It is repeated
 * here rather than imported, because the contracts package is a *built*
 * workspace package: importing it would make the suite depend on
 * `packages/contracts/dist` existing, which is only true after the
 * workspace has been built. The health test below fails loudly if the two
 * ever drift apart, so the duplication cannot go unnoticed.
 */
export const apiPrefix = "/api/v1";

/**
 * The markers of a Next.js error overlay.
 *
 * In development Next.js renders the overlay into a `<nextjs-portal>` element
 * with an open shadow root; the production build renders a plain error page
 * instead. Both carry one of these strings.
 */
const OVERLAY_ERROR_MARKERS = [
  "Unhandled Runtime Error",
  "Application error",
  "Runtime Error",
] as const;

/** The problems a page reported while it loaded. */
export interface PageProblems {
  /** The uncaught exceptions the page threw. */
  pageErrors: string[];
  /** The `console.error` messages the page logged. */
  consoleErrors: string[];
}

/**
 * Start collecting the errors a page reports.
 *
 * Call it **before** the first navigation: the errors of a page that fails to
 * mount are logged while it loads, not afterwards.
 */
export function watchForProblems(page: Page): PageProblems {
  const problems: PageProblems = { pageErrors: [], consoleErrors: [] };

  page.on("pageerror", (error) => {
    problems.pageErrors.push(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.consoleErrors.push(message.text());
    }
  });

  return problems;
}

/**
 * The text of the Next.js error overlay, if the page is showing one.
 *
 * Returns `null` when the page is healthy.
 */
export async function nextErrorOverlay(page: Page): Promise<string | null> {
  const portals = page.locator("nextjs-portal");
  const count = await portals.count();

  for (let index = 0; index < count; index += 1) {
    // The overlay lives in the portal's shadow root, so the text has to be
    // read from there — `innerText` of the host element would be empty.
    const text = await portals.nth(index).evaluate((host) => {
      const root = (host as HTMLElement).shadowRoot;

      return root?.textContent?.trim() ?? "";
    });

    if (OVERLAY_ERROR_MARKERS.some((marker) => text.includes(marker))) {
      return text.slice(0, 300);
    }
  }

  const bodyText = await page.locator("body").innerText();

  if (OVERLAY_ERROR_MARKERS.some((marker) => bodyText.includes(marker))) {
    return bodyText.slice(0, 300);
  }

  return null;
}

import { expect, test, type Locator, type Page } from "@playwright/test";

import { nextErrorOverlay, watchForProblems } from "./support/harness";

/**
 * The app shell.
 *
 * The domain features are not implemented yet, so this file covers what
 * exists: the landing page, the locale routing, the navigation and the
 * placeholder pages. `e2e/README.md` records the domain scenarios that are
 * still blocked.
 */

/** The locales the app ships. */
const LOCALES = ["en", "km"] as const;

/** The pages that exist as placeholders today. */
const PLACEHOLDER_ROUTES = [
  "/en/ticket/claim",
  "/en/guard/login",
  "/en/owner/sites",
  "/en/admin",
] as const;

/** The hrefs of every link in the site's navigation. */
async function navigationHrefs(page: Page): Promise<string[]> {
  return page
    .getByRole("navigation")
    .getByRole("link")
    .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
}

/**
 * The locale switch's link to the given locale.
 *
 * The switch is found by the `lang` attribute of its links rather than by
 * its label, because the label is translated — "Language" in English,
 * "ភាសា" in Khmer — and the suite must not depend on the copy.
 */
function localeLink(page: Page, locale: string): Locator {
  return page.getByRole("banner").locator(`a[lang="${locale}"]`);
}

test.describe("the landing page", () => {
  for (const locale of LOCALES) {
    test(`renders in ${locale}`, async ({ page }) => {
      const response = await page.goto(`/${locale}`);

      expect(response?.status()).toBe(200);

      // The locale layout owns the `lang` attribute: a Khmer page that
      // announces `lang="en"` tells a screen reader the wrong language.
      await expect(page.locator("html")).toHaveAttribute("lang", locale);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("renders a populated heading in each locale", async ({ page }) => {
    await page.goto("/en");
    const english = await page.getByRole("heading", { level: 1 }).innerText();

    await page.goto("/km");
    const khmer = await page.getByRole("heading", { level: 1 }).innerText();

    // The two catalogues are not a copy of each other — the guard at the
    // gate reads Khmer — but both are populated.
    expect(english.trim().length).toBeGreaterThan(0);
    expect(khmer.trim().length).toBeGreaterThan(0);
    expect(khmer).not.toBe(english);
  });
});

test.describe("the navigation", () => {
  for (const locale of LOCALES) {
    test(`the header links keep the ${locale} prefix`, async ({ page }) => {
      await page.goto(`/${locale}`);

      const hrefs = await navigationHrefs(page);

      expect(hrefs.length).toBeGreaterThan(0);

      for (const href of hrefs) {
        // The links are the locale-aware `Link`, so the prefix is always
        // there and a link can never drop the locale.
        expect(href, `the link ${href} must keep the ${locale} prefix`).toContain(`/${locale}/`);
      }
    });
  }

  test("the locale switch moves to the other locale and keeps the path", async ({ page }) => {
    await page.goto("/en/ticket/claim");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // The switch is a control now: the `common.language`, `common.english`
    // and `common.khmer` catalogue keys are rendered in the header, and the
    // Khmer option leads to the *same page* in Khmer.
    await localeLink(page, "km").click();

    await expect(page).toHaveURL(/\/km\/ticket\/claim$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "km");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    for (const href of await navigationHrefs(page)) {
      expect(href).toContain("/km/");
    }
  });

  test("the current locale is marked in the switch", async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);

      // The current locale is the one that is marked; the other one is the
      // way out of this language.
      await expect(localeLink(page, locale)).toHaveAttribute("aria-current", "page");
      await expect(localeLink(page, locale === "en" ? "km" : "en")).not.toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("a header link leads to the page it names", async ({ page }) => {
    await page.goto("/en");

    const link = page.getByRole("navigation").getByRole("link").first();
    const href = await link.getAttribute("href");

    await link.click();

    await expect(page).toHaveURL(new RegExp(`${href ?? ""}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("the placeholder pages", () => {
  for (const route of PLACEHOLDER_ROUTES) {
    test(`${route} mounts without error`, async ({ page }) => {
      const problems = watchForProblems(page);

      const response = await page.goto(route);

      expect(response?.status()).toBe(200);

      // Every page of the app opens with a heading, and so does every
      // placeholder page.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // A page that failed to mount is replaced by the Next.js error
      // overlay; the app's own chrome is gone with it.
      expect(await nextErrorOverlay(page)).toBeNull();

      expect(problems.pageErrors).toEqual([]);
      expect(problems.consoleErrors).toEqual([]);
    });
  }
});

test.describe("an unknown route", () => {
  test("answers 404 under an unknown locale", async ({ page }) => {
    const response = await page.goto("/xx/does-not-exist");

    // The proxy rewrites an unknown locale onto the default one, and the
    // route behind it does not exist: the answer is a 404, not a broken
    // page and not a 500.
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
  });

  test("answers 404 under a known locale", async ({ page }) => {
    const response = await page.goto("/en/does-not-exist");

    expect(response?.status()).toBe(404);
  });
});

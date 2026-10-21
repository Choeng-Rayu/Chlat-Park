import { defineRouting } from "next-intl/routing";

import { defaultLocale, localeList, locales } from "./config";

/**
 * The routing configuration.
 *
 * `localePrefix: "always"` means every URL carries its locale — `/en/guard`
 * and `/km/guard` are different pages, not the same page with a cookie. The
 * alternatives are worse for this product:
 *
 * - `as-needed` hides the prefix for the default locale, so an English link
 *   and a Khmer link are not interchangeable, and a shared link silently
 *   changes language for the receiver.
 * - `never` requires a cookie, which breaks server rendering and makes a
 *   link un-shareable.
 *
 * The locale is detected from the URL first, then from the `Accept-Language`
 * header and the locale cookie.
 */
export const routing = defineRouting({
  locales: localeList,
  defaultLocale,
  localePrefix: "always",
  localeDetection: true,
});

/** The routing type, for reuse in the navigation helpers. */
export type Routing = typeof routing;

/** The supported locales, re-exported for convenience. */
export { locales };

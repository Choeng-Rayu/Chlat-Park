import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isLocale, timeZone } from "./config";

/**
 * The per-request i18n configuration.
 *
 * The messages are imported **dynamically** so a request only ever loads
 * the bundle for its own locale — the Khmer catalogue is not shipped to a
 * guest who is reading English.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    timeZone,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // A missing translation falls back to the key rather than rendering an
    // empty string. A visible key is a bug report; a blank space is a
    // silent failure.
    onError: (error: { message?: string }) => {
      if (process.env["NODE_ENV"] === "development") {
        console.warn(`[i18n] ${error.message ?? "missing translation"}`);
      }
    },
  };
});

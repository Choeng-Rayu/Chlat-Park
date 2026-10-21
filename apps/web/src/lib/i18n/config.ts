/**
 * The i18n configuration.
 *
 * Chlat-Park ships two locales from day one: **English** (`en`) and
 * **Khmer** (`km`). Khmer is not a "nice to have" here — it is the primary
 * language of the guard at the gate and of the motorcycle owner paying the
 * fee, so every user-facing string must have a Khmer translation.
 *
 * The locale is part of the URL (`/en/...`, `/km/...`), always, so a shared
 * link carries the language with it and the server can render the right
 * language on the first paint — no client-side language switch, no flash of
 * the wrong language.
 */

/** The supported locales. */
export const locales = ["en", "km"] as const;

/** A supported locale. */
export type Locale = (typeof locales)[number];

/** The locale used when nothing else matches. */
export const defaultLocale: Locale = "en";

/**
 * The time zone every date and number is rendered in.
 *
 * Cambodia has one time zone and no daylight saving, so the offset is
 * constant. Rendering in UTC would put every session in the wrong day; the
 * site may carry its own zone, but the platform default is Cambodia's.
 */
export const timeZone = "Asia/Phnom_Penh";

/** The locales, as a plain array (next-intl wants a mutable `string[]`). */
export const localeList: string[] = [...locales];

/** Is the given string a supported locale? */
export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

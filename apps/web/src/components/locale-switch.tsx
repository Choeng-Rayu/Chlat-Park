"use client";

import { useLocale, useTranslations } from "next-intl";

import { locales, type Locale } from "@/lib/i18n/config";
import { Link, usePathname } from "@/lib/i18n/navigation";

/**
 * The catalogue key that names each locale.
 *
 * The two labels are endonyms — "English" and "ភាសាខ្មែរ" — so a visitor
 * who cannot read the page's current language can still find their own.
 */
const LOCALE_LABEL_KEYS = {
  en: "english",
  km: "khmer",
} as const satisfies Record<Locale, "english" | "khmer">;

/**
 * The locale switch.
 *
 * A visitor who lands on `/en` has to be able to reach the Khmer page, so
 * the switch sits in the header of every page. It is a **client component**
 * because the current path is only known in the browser: the switch has to
 * keep it, so `/en/ticket/claim` links to `/km/ticket/claim` and not to the
 * locale root.
 *
 * `usePathname` is next-intl's, not Next's: it returns the path **without**
 * the locale prefix, and `Link` puts the prefix of the target locale back
 * on. The path therefore survives the switch, and a link can never produce
 * a URL without a locale.
 *
 * It is deliberately **not** a `navigation` landmark. The site's own
 * navigation is the `nav` element in the header, and this is a control of
 * the chrome rather than a link into the site map.
 */
export function LocaleSwitch() {
  const t = useTranslations("common");
  const currentLocale = useLocale();
  const pathname = usePathname();

  return (
    <div className="ml-auto flex items-center gap-2 text-sm">
      <span className="text-ink-500">{t("language")}</span>
      <ul className="flex items-center gap-1" aria-label={t("language")}>
        {locales.map((locale) => {
          const isCurrent = locale === currentLocale;

          return (
            <li key={locale}>
              <Link
                href={pathname}
                locale={locale}
                lang={locale}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "rounded px-2 py-1 font-semibold text-ink-900 underline decoration-accent-600 decoration-2 underline-offset-4"
                    : "rounded px-2 py-1 text-ink-600 hover:bg-ink-100 hover:text-ink-950"
                }
              >
                {t(LOCALE_LABEL_KEYS[locale])}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

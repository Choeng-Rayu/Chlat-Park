import { getTranslations } from "next-intl/server";

import { LocaleSwitch } from "@/components/locale-switch";
import { Link } from "@/lib/i18n/navigation";

/**
 * The site header.
 *
 * It links to the three surfaces a person can land on, and it is the one
 * place that decides what the navigation looks like. The links are the
 * locale-aware `Link`, so the locale prefix is always present.
 *
 * The locale switch lives here too: a visitor who cannot read the page's
 * language has to be able to change it from anywhere, and the header is the
 * only piece of chrome that every page has.
 */
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });

  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-base font-bold tracking-tight text-ink-900">
          Chlat-Park
        </Link>

        <nav aria-label={t("home")} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/ticket/claim" className="text-ink-700 hover:text-ink-950">
            {t("ticket")}
          </Link>
          <Link href="/guard/login" className="text-ink-700 hover:text-ink-950">
            {t("guard")}
          </Link>
          <Link href="/owner/sites" className="text-ink-700 hover:text-ink-950">
            {t("owner")}
          </Link>
          <Link href="/admin" className="text-ink-700 hover:text-ink-950">
            {t("admin")}
          </Link>
        </nav>

        <LocaleSwitch />
      </div>
    </header>
  );
}

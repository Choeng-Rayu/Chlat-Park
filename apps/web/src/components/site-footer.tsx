import { getTranslations } from "next-intl/server";

/**
 * The site footer.
 *
 * Deliberately minimal: the app is a tool, not a brochure.
 */
export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "footer" });

  return (
    <footer className="mt-12 border-t border-ink-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-sm text-ink-500">
        <p>{t("built")}</p>
        <p>
          <a href="/specs" className="hover:text-ink-800">
            {t("specs")}
          </a>
          <span className="mx-2 text-ink-300">·</span>
          <a href="/docs" className="hover:text-ink-800">
            {t("docs")}
          </a>
        </p>
      </div>
    </footer>
  );
}

import { getTranslations } from "next-intl/server";

/**
 * The site footer.
 *
 * Deliberately minimal: the app is a tool, not a brochure. The only line is
 * the "built" line — the specifications and the documentation are developer
 * records that live in the repository, not pages of the product, so the
 * footer does not link to them.
 */
export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "footer" });

  return (
    <footer className="mt-12 border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-5 text-sm text-ink-500">
        <p>{t("built")}</p>
      </div>
    </footer>
  );
}

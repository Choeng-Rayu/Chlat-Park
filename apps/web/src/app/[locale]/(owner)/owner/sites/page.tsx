import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

/**
 * The owner's site list.
 *
 * It shows the sites the signed-in owner administers. The list comes from
 * `GET /sites` with the `platform.sites.read` permission resolved against
 * the owner's **owned** scope — the API decides which sites are visible, and
 * a site the owner does not own is simply not in the response.
 */
export default async function OwnerSitesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "owner.sites" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink-950">{t("title")}</h1>
      <p className="mt-1 text-ink-600">{t("subtitle")}</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {(["activeSites", "deactivated"] as const).map((metric) => (
          <div key={metric} className="surface p-5">
            <p className="text-sm text-ink-500">{t(metric)}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">—</p>
          </div>
        ))}
      </section>

      <section className="surface mt-6 p-6">
        <p className="text-sm text-ink-500">{t("noSites")}</p>
        <p className="mt-2 text-xs text-ink-400">{t("comingSoonDescription")}</p>

        <Link href="/" className="link mt-4 inline-block text-sm">
          {t("viewSite")}
        </Link>
      </section>
    </main>
  );
}

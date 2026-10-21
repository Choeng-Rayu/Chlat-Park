import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { isUuid } from "@/lib/validation/uuid";

/**
 * The guard's site dashboard.
 *
 * It shows the site's live state: the sessions that are active right now,
 * the entry claims that have not been claimed yet, and today's totals.
 *
 * **The page reads; it never decides.** Which sessions a guard may see, and
 * what a session's state means, is decided by the API's authorization layer
 * (`site.sessions.read` within the guard's assigned scope). A guard who is
 * not assigned to this site gets a 403 from the API, and the page surfaces
 * that as an error — it does not try to work around it.
 */
export default async function GuardSitePage({
  params,
}: {
  params: Promise<{ locale: string; siteId: string }>;
}) {
  const { locale, siteId } = await params;

  setRequestLocale(locale);

  // A malformed id is a 404 before the API is called: there is no point
  // asking the API about an id that cannot exist.
  if (!isUuid(siteId)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "guard.site" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink-950">{t("title")}</h1>
      <p className="mt-1 font-mono text-xs text-ink-400">{siteId}</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {(["activeSessions", "pendingClaims", "today"] as const).map((metric) => (
          <div key={metric} className="surface p-5">
            <p className="text-sm text-ink-500">{t(metric)}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">—</p>
          </div>
        ))}
      </section>

      <section className="surface mt-6 p-6">
        <p className="text-sm text-ink-500">{t("noSessions")}</p>
        <p className="mt-2 text-xs text-ink-400">{t("comingSoonDescription")}</p>
      </section>
    </main>
  );
}

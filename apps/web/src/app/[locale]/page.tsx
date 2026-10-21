import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

/**
 * The landing page.
 *
 * It is the entry point for all four audiences: the guest claiming a
 * ticket, the guard at the gate, the parking owner, and the platform
 * administrator.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="surface p-8">
        <h1 className="text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-600">{t("subtitle")}</p>

        <p className="mt-6 border-l-4 border-accent-500 bg-accent-400/10 px-4 py-3 text-sm text-ink-700">
          {t("centralRule")}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/ticket/claim" className="btn btn-primary">
            {t("guestCta")}
          </Link>
          <Link href="/guard/login" className="btn btn-secondary">
            {t("guardCta")}
          </Link>
          <Link href="/owner/sites" className="btn btn-secondary">
            {t("ownerCta")}
          </Link>
          <Link href="/admin" className="btn btn-secondary">
            {t("adminCta")}
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t("howItWorks.title")}</h2>

        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {(["step1", "step2", "step3"] as const).map((step, index) => (
            <li key={step} className="surface p-5">
              <span className="text-xs font-semibold tracking-widest text-ink-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-semibold text-ink-900">{t(`howItWorks.${step}.title`)}</h3>
              <p className="mt-2 text-sm text-ink-600">{t(`howItWorks.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

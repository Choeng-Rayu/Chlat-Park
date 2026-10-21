import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * The guard sign-in page.
 *
 * The form will post to `POST /auth/login`. The API answers with the access
 * token and sets it as an HttpOnly cookie; the page then redirects to the
 * guard's site.
 *
 * The error message is uniform: "Invalid email or password" whether the
 * address is unknown or the password is wrong. The API never says which.
 */
export default async function GuardLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "guard.login" });

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="surface p-6">
        <h1 className="text-xl font-bold tracking-tight text-ink-950">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-600">{t("subtitle")}</p>

        <form className="mt-6 space-y-4" action="#" method="post">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink-700">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink-700">
              {t("password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled>
            {t("submit")}
          </button>
        </form>

        <p className="mt-4 text-xs text-ink-400">{t("comingSoonDescription")}</p>
      </div>
    </main>
  );
}

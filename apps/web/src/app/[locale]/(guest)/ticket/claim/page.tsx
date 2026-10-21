import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * The guest ticket-claim page.
 *
 * The flow it will implement:
 *
 * 1. The guest opens this page (from the QR deep link, or by typing the
 *    code).
 * 2. The camera scans the entry QR, or the guest pastes the code.
 * 3. The browser posts the raw claim token to `POST /entry-claims/claim`.
 *    The token is single-use and expires after five minutes.
 * 4. The API answers with the e-ticket: a ticket token bound to the plate
 *    and the parking session.
 * 5. The guest shows the ticket at the exit; the guard scans it and the API
 *    — not the QR — decides whether the vehicle may leave.
 *
 * **The page never decides anything.** It renders what the API says. The
 * rules about whether a claim is valid, expired, already used, or belongs to
 * another site live in the backend.
 */
export default async function TicketClaimPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "ticket.claim" });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink-950">{t("heading")}</h1>
      <p className="mt-2 text-ink-600">{t("subtitle")}</p>

      <section className="surface mt-6 p-6">
        <h2 className="font-semibold text-ink-900">{t("title")}</h2>
        <p className="mt-2 text-sm text-ink-600">{t("instructions")}</p>

        <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink-500">{t("scan")}</p>
          <p className="text-xs text-ink-400">{t("comingSoonDescription")}</p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-ink-700">{t("manualEntry")}</p>
          <div className="mt-2 flex gap-2">
            <label className="sr-only" htmlFor="claim-code">
              {t("codeLabel")}
            </label>
            <input
              id="claim-code"
              name="code"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder={t("codePlaceholder")}
              className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
              disabled
            />
            <button type="button" className="btn btn-primary" disabled>
              {t("submit")}
            </button>
          </div>
        </div>
      </section>

      <section className="surface mt-6 p-6">
        <h2 className="font-semibold text-ink-900">{t("success.title")}</h2>
        <p className="mt-2 text-sm text-ink-600">{t("success.body")}</p>
        <p className="mt-1 text-xs text-ink-400">{t("success.validUntil")}</p>
      </section>
    </main>
  );
}

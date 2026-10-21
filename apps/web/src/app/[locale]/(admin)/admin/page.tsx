import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * The super-admin dashboard.
 *
 * **Owner: vireaboth** — see `docs/TEAM-WORKFLOW.md` for the split and
 * `docs/admin-api-contract.md` for the endpoints this page will call.
 *
 * The page will show four panels:
 *
 * | Panel | Endpoint | Permission |
 * |---|---|---|
 * | Revenue | `GET /admin/revenue` | `platform.revenue.read` |
 * | Adoption | `GET /admin/adoption` | `platform.analytics.read` |
 * | Platform management | `GET /admin/sites`, `/admin/owners`, `/admin/users` | `platform.sites.read`, `platform.owners.read`, `platform.users.read` |
 * | Audit | `GET /admin/audit` | `platform.audit.read` |
 *
 * Two rules the implementation must not break:
 *
 * 1. **`EXEMPT` and `VOIDED` stay separate.** They are revenue leakage and
 *    corrections, not revenue. They are never netted into the collected
 *    figure.
 * 2. **No raw plate is ever rendered.** The adoption panel is built from
 *    aggregates; the API never returns a `plate_digest`, and the page must
 *    not attempt to reconstruct one.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.dashboard" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink-950">{t("title")}</h1>
      <p className="mt-1 text-ink-600">{t("subtitle")}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink-900">{t("revenue")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(["collected", "exempt", "voided", "failed", "uncollected"] as const).map((figure) => (
            <div key={figure} className="surface p-5">
              <p className="text-sm text-ink-500">{t(figure)}</p>
              <p className="mt-2 text-2xl font-semibold text-ink-950">—</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-400">{t("noRawPlates")}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t("adoption")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              "registeredUsers",
              "distinctGuests",
              "activeUsers",
              "repeatRate",
              "claimRate",
              "completionRate",
              "registeredVsGuest",
              "monthlyTrend",
            ] as const
          ).map((metric) => (
            <div key={metric} className="surface p-5">
              <p className="text-sm text-ink-500">{t(metric)}</p>
              <p className="mt-2 text-2xl font-semibold text-ink-950">—</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t("sites")}</h2>
        <div className="surface mt-3 p-6">
          <p className="text-sm text-ink-500">{t("comingSoonDescription")}</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t("owners")}</h2>
        <div className="surface mt-3 p-6">
          <p className="text-sm text-ink-500">{t("comingSoonDescription")}</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t("users")}</h2>
        <div className="surface mt-3 p-6">
          <p className="text-sm text-ink-500">{t("comingSoonDescription")}</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink-900">{t("audit")}</h2>
        <div className="surface mt-3 p-6">
          <p className="text-sm text-ink-500">{t("comingSoonDescription")}</p>
        </div>
      </section>
    </main>
  );
}

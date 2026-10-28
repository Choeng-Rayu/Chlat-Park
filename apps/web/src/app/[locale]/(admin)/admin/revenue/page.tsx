
import { setRequestLocale } from "next-intl/server";
import RevenueDateFilter from "./revenue-date-filter";

export default async function AdminRevenuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const metrics = [
    {
      key: "collected",
      label: "Collected revenue",
      note: "Payments successfully collected",
    },
    {
      key: "exempt",
      label: "Exempt payments",
      note: "Shown separately; not revenue",
    },
    {
      key: "voided",
      label: "Voided payments",
      note: "Shown separately; not revenue",
    },
    {
      key: "failed",
      label: "Failed payments",
      note: "Count of failed payments",
    },
    {
      key: "uncollected",
      label: "Uncollected revenue",
      note: "Completed sessions without paid payment",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink-950">
        Revenue
      </h1>

      <p className="mt-1 text-ink-600">
        Platform-wide revenue overview and payment exceptions.
      </p>

      <RevenueDateFilter />

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Preview only — live API data is not connected yet. Do not use these
        placeholders for financial decisions.
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink-900">
          Revenue summary
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <article
              key={metric.key}
              className="surface rounded-lg p-5"
            >
              <p className="text-sm font-medium text-ink-600">
                {metric.label}
              </p>

              <p className="mt-3 text-3xl font-semibold text-ink-950">
                —
              </p>

              <p className="mt-2 text-xs text-ink-500">
                {metric.note}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 surface rounded-lg p-5">
        <h2 className="font-semibold text-ink-900">
          Uncaptured payment warning
        </h2>

        <p className="mt-2 text-sm text-ink-600">
          This warning will show the count and amount of uncaptured payments
          once the API provides those values.
        </p>
      </section>

      <p className="mt-6 text-xs text-ink-500">
        Exempt and voided amounts are kept separate from collected revenue.
        Amounts must be grouped by currency and must not be combined across
        different currencies.
      </p>
    </main>
  );
}

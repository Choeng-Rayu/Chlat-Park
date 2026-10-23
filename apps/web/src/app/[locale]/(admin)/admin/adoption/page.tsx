import { setRequestLocale } from "next-intl/server";
import RevenueDateFilter from "../revenue/revenue-date-filter";

    const metrics = [
    {
        key: "registered",
        label: "Registered users",
        description: "Registered accounts in the selected period",
    },
    {
        key: "guests",
        label: "Distinct guests",
        description: "Distinct guests identified through privacy-safe aggregation",
    },
    {
        key: "active",
        label: "Active users",
        description: "Combined registered and guest activity",
    },
    {
        key: "repeat",
        label: "Repeat rate",
        description: "Guests with repeat sessions",
    },
    ];

    const funnelStages = [
    "Sessions created",
    "Entry claims issued",
    "Tickets issued",
    "Sessions completed",
    ];

    export default async function AdminAdoptionPage({
    params,
    }: {
    params: Promise<{ locale: string }>;
    }) {
    const { locale } = await params;
    setRequestLocale(locale);

    return (
        <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-ink-950">
            Platform Adoption
        </h1>

        <p className="mt-1 text-ink-600">
            Understand platform growth, guest activity, and parking usage.
        </p>

        <RevenueDateFilter />

        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Preview only — live API data is not connected yet. Metrics are
            placeholders and must not be interpreted as actual platform statistics.
        </div>

        <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink-900">
            Adoption overview
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
                <article key={metric.key} className="surface rounded-lg p-5">
                <p className="text-sm font-medium text-ink-600">
                    {metric.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-ink-950">—</p>
                <p className="mt-2 text-xs text-ink-500">
                    {metric.description}
                </p>
                </article>
            ))}
            </div>
        </section>

        <section className="mt-8 surface rounded-lg p-5">
            <h2 className="text-lg font-semibold text-ink-900">
            Usage funnel
            </h2>
            <p className="mt-1 text-sm text-ink-600">
            Follow activity from session creation through completion.
            </p>

            <div className="mt-4 divide-y divide-ink-100">
            {funnelStages.map((stage) => (
                <div
                key={stage}
                className="flex items-center justify-between gap-4 py-4"
                >
                <span className="text-sm text-ink-700">{stage}</span>
                <span className="font-semibold text-ink-950">—</span>
                </div>
            ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-200 p-4">
                <p className="text-sm text-ink-600">Claim rate</p>
                <p className="mt-2 text-2xl font-semibold text-ink-950">—</p>
            </div>
            <div className="rounded-lg border border-ink-200 p-4">
                <p className="text-sm text-ink-600">Completion rate</p>
                <p className="mt-2 text-2xl font-semibold text-ink-950">—</p>
            </div>
            </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <article className="surface rounded-lg p-5">
            <h2 className="font-semibold text-ink-900">
                Registered vs. guest sessions
            </h2>
            <p className="mt-2 text-sm text-ink-600">
                A breakdown of sessions by user type will appear here when the API
                is connected.
            </p>
            <div className="mt-5 rounded-md border border-dashed border-ink-300 p-8 text-center text-sm text-ink-500">
                No data available yet
            </div>
            </article>

            <article className="surface rounded-lg p-5">
            <h2 className="font-semibold text-ink-900">Monthly trend</h2>
            <p className="mt-2 text-sm text-ink-600">
                Track monthly session counts and new distinct guests.
            </p>
            <div className="mt-5 rounded-md border border-dashed border-ink-300 p-8 text-center text-sm text-ink-500">
                Chart will appear when API data is available
            </div>
            </article>
        </section>

        <p className="mt-6 text-xs text-ink-500">
            Guest metrics are aggregated for privacy. Raw license plates and plate
            digests must never be displayed.
        </p>
        </main>
    );
    }
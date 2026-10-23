    import { setRequestLocale } from "next-intl/server";

    type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";
    type OutcomeFilter = "all" | AuditOutcome;

    interface AuditEntry {
    id: string;
    action: string;
    outcome: AuditOutcome;
    actorUserId: string;
    actorRole: string;
    siteId: string | null;
    targetType: string;
    targetId: string;
    scopeKind: string;
    requestId: string;
    createdAt: string;
    }

    interface AuditPageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{
        from?: string;
        to?: string;
        action?: string;
        outcome?: string;
        actorUserId?: string;
        siteId?: string;
        targetType?: string;
    }>;
    }

    // Fictional preview data only. Replace with GET /api/v1/admin/audit when the
    // backend endpoint is ready. Never include plate data or tokens in audit rows.
    const PREVIEW_ENTRIES: AuditEntry[] = [
    {
        id: "preview-audit-1",
        action: "site.deactivated",
        outcome: "SUCCESS",
        actorUserId: "preview-admin-1",
        actorRole: "super_admin",
        siteId: "preview-site-2",
        targetType: "parking_site",
        targetId: "preview-site-2",
        scopeKind: "platform",
        requestId: "preview-request-0001",
        createdAt: "2026-10-20T14:22:11.000Z",
    },
    {
        id: "preview-audit-2",
        action: "site.created",
        outcome: "SUCCESS",
        actorUserId: "preview-admin-2",
        actorRole: "super_admin",
        siteId: "preview-site-3",
        targetType: "parking_site",
        targetId: "preview-site-3",
        scopeKind: "platform",
        requestId: "preview-request-0002",
        createdAt: "2026-10-19T09:10:00.000Z",
    },
    {
        id: "preview-audit-3",
        action: "owner.suspend",
        outcome: "DENIED",
        actorUserId: "preview-admin-1",
        actorRole: "super_admin",
        siteId: null,
        targetType: "owner",
        targetId: "preview-owner-2",
        scopeKind: "platform",
        requestId: "preview-request-0003",
        createdAt: "2026-10-18T16:45:32.000Z",
    },
    {
        id: "preview-audit-4",
        action: "auth.login",
        outcome: "FAILURE",
        actorUserId: "preview-user-3",
        actorRole: "owner",
        siteId: null,
        targetType: "user",
        targetId: "preview-user-3",
        scopeKind: "owned",
        requestId: "preview-request-0004",
        createdAt: "2026-10-17T07:35:00.000Z",
    },
    ];

    function startOfDate(value: string): number | null {
    if (!value) return null;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isNaN(timestamp) ? null : timestamp;
    }

    function endOfDateExclusive(value: string): number | null {
    const start = startOfDate(value);
    if (start === null) return null;
    return start + 24 * 60 * 60 * 1000;
    }

    function formatDateTime(value: string, locale: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
    }

    function SummaryCard({
    label,
    value,
    tone = "neutral",
    }: {
    label: string;
    value: number;
    tone?: "neutral" | "success" | "failure" | "denied";
    }) {
    const valueClass =
        tone === "success"
        ? "text-green-700"
        : tone === "failure"
            ? "text-red-700"
            : tone === "denied"
            ? "text-amber-700"
            : "text-ink-950";

    return (
        <article className="surface rounded-lg p-5">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        <p className={`mt-3 text-3xl font-semibold ${valueClass}`}>{value}</p>
        <p className="mt-2 text-xs text-ink-500">Currently displayed preview records</p>
        </article>
    );
    }

    function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
    const classes =
        outcome === "SUCCESS"
        ? "bg-green-50 text-green-700"
        : outcome === "FAILURE"
            ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-800";
    const label = outcome.charAt(0) + outcome.slice(1).toLowerCase();

    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>
        {label}
        </span>
    );
    }

    export default async function AdminAuditPage({
    params,
    searchParams,
    }: AuditPageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    const query = await searchParams;
    const from = query.from ?? "";
    const to = query.to ?? "";
    const action = (query.action ?? "").trim().slice(0, 120);
    const actorUserId = (query.actorUserId ?? "").trim().slice(0, 100);
    const siteId = (query.siteId ?? "").trim().slice(0, 100);
    const targetType = (query.targetType ?? "").trim().slice(0, 100);
    const outcome: OutcomeFilter =
        query.outcome === "SUCCESS" ||
        query.outcome === "FAILURE" ||
        query.outcome === "DENIED"
        ? query.outcome
        : "all";

    const fromTimestamp = startOfDate(from);
    const toTimestamp = endOfDateExclusive(to);
    const entries = PREVIEW_ENTRIES.filter((entry) => {
        const entryTime = new Date(entry.createdAt).getTime();
        const matchesFrom = fromTimestamp === null || entryTime >= fromTimestamp;
        const matchesTo = toTimestamp === null || entryTime < toTimestamp;
        const matchesAction =
        !action || entry.action.toLowerCase().includes(action.toLowerCase());
        const matchesOutcome = outcome === "all" || entry.outcome === outcome;
        const matchesActor = !actorUserId || entry.actorUserId.includes(actorUserId);
        const matchesSite = !siteId || (entry.siteId ?? "").includes(siteId);
        const matchesTarget =
        !targetType || entry.targetType.toLowerCase().includes(targetType.toLowerCase());

        return (
        matchesFrom &&
        matchesTo &&
        matchesAction &&
        matchesOutcome &&
        matchesActor &&
        matchesSite &&
        matchesTarget
        );
    });

    const successCount = entries.filter((entry) => entry.outcome === "SUCCESS").length;
    const failureCount = entries.filter((entry) => entry.outcome === "FAILURE").length;
    const deniedCount = entries.filter((entry) => entry.outcome === "DENIED").length;
    const resetHref = `/${locale}/admin/audit`;

    return (
        <main className="mx-auto max-w-6xl px-4 py-10">
        <header>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">Audit Logs</h1>
            <p className="mt-1 text-ink-600">
            Review privileged actions and security-relevant events across the platform.
            </p>
        </header>

        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Preview mode</p>
            <p className="mt-1">
            Live API data is not connected yet. The audit records shown below are
            fictional examples for frontend development only.
            </p>
        </div>

        <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink-900">Audit overview</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Displayed events" value={entries.length} />
            <SummaryCard label="Successful" value={successCount} tone="success" />
            <SummaryCard label="Failed" value={failureCount} tone="failure" />
            <SummaryCard label="Denied" value={deniedCount} tone="denied" />
            </div>
        </section>

        <section className="mt-8 surface rounded-lg p-5">
            <h2 className="text-lg font-semibold text-ink-900">Filter audit records</h2>
            <p className="mt-1 text-sm text-ink-600">
            Dates are inclusive in the form: selecting an end date includes that
            whole calendar day. The live API defaults to the last seven days when
            no date range is provided.
            </p>

            <form method="GET" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
                <label htmlFor="from" className="mb-1.5 block text-sm font-medium text-ink-700">From date</label>
                <input id="from" name="from" type="date" defaultValue={from} className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-500 focus:ring-2 focus:ring-ink-100" />
            </div>
            <div>
                <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-ink-700">To date</label>
                <input id="to" name="to" type="date" defaultValue={to} min={from || undefined} className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-500 focus:ring-2 focus:ring-ink-100" />
            </div>
            <div>
                <label htmlFor="action" className="mb-1.5 block text-sm font-medium text-ink-700">Action</label>
                <input id="action" name="action" maxLength={120} defaultValue={action} placeholder="e.g. site.deactivated" className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100" />
            </div>
            <div>
                <label htmlFor="outcome" className="mb-1.5 block text-sm font-medium text-ink-700">Outcome</label>
                <select id="outcome" name="outcome" defaultValue={outcome} className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-500 focus:ring-2 focus:ring-ink-100">
                <option value="all">All outcomes</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILURE">Failure</option>
                <option value="DENIED">Denied</option>
                </select>
            </div>
            <div>
                <label htmlFor="actorUserId" className="mb-1.5 block text-sm font-medium text-ink-700">Actor user ID</label>
                <input id="actorUserId" name="actorUserId" defaultValue={actorUserId} placeholder="Actor ID" className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100" />
            </div>
            <div>
                <label htmlFor="siteId" className="mb-1.5 block text-sm font-medium text-ink-700">Site ID</label>
                <input id="siteId" name="siteId" defaultValue={siteId} placeholder="Site ID" className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100" />
            </div>
            <div>
                <label htmlFor="targetType" className="mb-1.5 block text-sm font-medium text-ink-700">Target type</label>
                <input id="targetType" name="targetType" defaultValue={targetType} placeholder="e.g. parking_site" className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100" />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
                <button type="submit" className="h-10 rounded-md bg-ink-950 px-4 text-sm font-medium text-white transition hover:opacity-90">Apply filters</button>
                <a href={resetHref} className="inline-flex h-10 items-center justify-center rounded-md border border-ink-200 px-4 text-sm font-medium text-ink-700 transition hover:bg-ink-50">Reset</a>
            </div>
            </form>
        </section>

        <section className="mt-8 surface overflow-hidden rounded-lg">
            <div className="flex flex-col gap-1 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h2 className="text-lg font-semibold text-ink-900">Audit event log</h2>
                <p className="mt-1 text-sm text-ink-600">Action, outcome, actor, target, and request reference.</p>
            </div>
            <p className="text-sm text-ink-500">{entries.length} displayed</p>
            </div>

            {entries.length === 0 ? (
            <div className="p-8 text-center">
                <h3 className="font-medium text-ink-900">No audit records found</h3>
                <p className="mt-1 text-sm text-ink-600">Try widening the date range or removing a filter.</p>
            </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-ink-50">
                    <tr>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Timestamp</th>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Action</th>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Outcome</th>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Actor</th>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Target</th>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Site ID</th>
                    <th scope="col" className="px-5 py-3 font-medium text-ink-600">Request ID</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                    {entries.map((entry) => (
                    <tr key={entry.id} className="transition hover:bg-ink-50">
                        <td className="whitespace-nowrap px-5 py-4 text-ink-600">{formatDateTime(entry.createdAt, locale)}</td>
                        <td className="px-5 py-4">
                        <p className="font-medium text-ink-900">{entry.action}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{entry.scopeKind} scope</p>
                        </td>
                        <td className="px-5 py-4"><OutcomeBadge outcome={entry.outcome} /></td>
                        <td className="px-5 py-4">
                        <p className="font-medium text-ink-900">{entry.actorRole.replace(/_/g, " ")}</p>
                        <p className="mt-0.5 break-all text-xs text-ink-500">{entry.actorUserId}</p>
                        </td>
                        <td className="px-5 py-4">
                        <p className="font-medium text-ink-900">{entry.targetType}</p>
                        <p className="mt-0.5 break-all text-xs text-ink-500">{entry.targetId}</p>
                        </td>
                        <td className="break-all px-5 py-4 text-ink-600">{entry.siteId ?? "—"}</td>
                        <td className="px-5 py-4"><span className="font-mono text-xs text-ink-600">{entry.requestId}</span></td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            )}
        </section>

        <div className="mt-6 rounded-lg border border-ink-200 p-4 text-sm text-ink-600">
            <p className="font-medium text-ink-900">Audit privacy and export</p>
            <p className="mt-1">
            This table never displays ticket tokens, claim tokens, or raw vehicle
            plates. Export is not enabled on this preview page; the contract requires
            both audit-read and audit-export permissions, and export requests are
            themselves audited.
            </p>
        </div>
        </main>
    );
    }
    import { setRequestLocale } from "next-intl/server";
    import { apiFetch, ApiError } from "@/lib/api/client";
    import { getAccessToken } from "@/lib/auth/session";

    // Keep true while the admin API is not ready. Preview records are fictional.
    const PREVIEW_MODE = false;

    type SiteStatus = "active" | "deactivated";

    interface Site {
    id: string;
    name: string;
    code: string;
    status: SiteStatus;
    currency: string;
    timeZone: string;
    owner: { id: string; displayName: string; email: string };
    activeSessionCount: number;
    createdAt: string;
    }

    interface SitesResponse {
    sites: Site[];
    page: { nextCursor: string | null; hasMore: boolean };
    }

    interface SitesPageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{
        search?: string;
        status?: string;
        ownerId?: string;
        cursor?: string;
        limit?: string;
    }>;
    }

    const PREVIEW_SITES: Site[] = [
    {
        id: "preview-site-1",
        name: "Example Central Market Lot",
        code: "example-central-market",
        status: "active",
        currency: "USD",
        timeZone: "Asia/Phnom_Penh",
        owner: {
        id: "preview-owner-1",
        displayName: "Example Owner One",
        email: "owner.one@example.com",
        },
        activeSessionCount: 14,
        createdAt: "2026-09-10T08:00:00.000Z",
    },
    {
        id: "preview-site-2",
        name: "Example Riverside Lot",
        code: "example-riverside",
        status: "deactivated",
        currency: "USD",
        timeZone: "Asia/Phnom_Penh",
        owner: {
        id: "preview-owner-2",
        displayName: "Example Owner Two",
        email: "owner.two@example.com",
        },
        activeSessionCount: 0,
        createdAt: "2026-09-15T08:00:00.000Z",
    },
    {
        id: "preview-site-3",
        name: "Example Campus Parking",
        code: "example-campus-parking",
        status: "active",
        currency: "KHR",
        timeZone: "Asia/Phnom_Penh",
        owner: {
        id: "preview-owner-1",
        displayName: "Example Owner One",
        email: "owner.one@example.com",
        },
        activeSessionCount: 6,
        createdAt: "2026-10-01T08:00:00.000Z",
    },
    ];

    function formatDate(value: string, locale: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(locale);
    }

    function buildHref(
    locale: string,
    values: Record<string, string | undefined>,
    ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
    }
    const query = params.toString();
    return `/${locale}/admin/sites${query ? `?${query}` : ""}`;
    }

    export default async function AdminSitesPage({
    params,
    searchParams,
    }: SitesPageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    const requested = await searchParams;
    const search = (requested.search ?? "").trim().slice(0, 120);
    const requestedStatus = requested.status ?? "all";
    const status =
        requestedStatus === "active" || requestedStatus === "deactivated"
        ? requestedStatus
        : "all";
    const ownerId = (requested.ownerId ?? "").trim().slice(0, 100);
    const requestedLimit = Number(requested.limit ?? 20);
    const limit = Number.isInteger(requestedLimit)
        ? Math.min(100, Math.max(1, requestedLimit))
        : 20;
    const cursor = requested.cursor?.trim();

    let sites: Site[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;
    let errorMessage: string | null = null;

    if (PREVIEW_MODE) {
        sites = PREVIEW_SITES.filter((site) => {
        const term = search.toLowerCase();
        const matchesSearch =
            !term ||
            site.name.toLowerCase().includes(term) ||
            site.code.toLowerCase().includes(term) ||
            site.owner.displayName.toLowerCase().includes(term) ||
            site.owner.email.toLowerCase().includes(term);
        const matchesStatus = status === "all" || site.status === status;
        const matchesOwner = !ownerId || site.owner.id === ownerId;
        return matchesSearch && matchesStatus && matchesOwner;
        });
    } else {
        const token = await getAccessToken();
        if (!token) {
        errorMessage = "Please sign in to view site records.";
        } else {
        try {
            const result = await apiFetch<SitesResponse>({
            path: "/admin/sites",
            token,
            query: {
                ...(status !== "all" ? { status } : {}),
                ...(ownerId ? { ownerId } : {}),
                ...(cursor ? { cursor } : {}),
                limit,
            },
            cache: "no-store",
            });
            sites = result.sites;
            nextCursor = result.page.nextCursor;
            hasMore = result.page.hasMore;
            // The contract does not define a server-side search parameter. In live
            // mode, search only filters the records on the page that was returned.
            if (search) {
            const term = search.toLowerCase();
            sites = sites.filter(
                (site) =>
                site.name.toLowerCase().includes(term) ||
                site.code.toLowerCase().includes(term) ||
                site.owner.displayName.toLowerCase().includes(term) ||
                site.owner.email.toLowerCase().includes(term),
            );
            }
        } catch (error) {
            if (error instanceof ApiError && error.isForbidden) {
            errorMessage = "You do not have permission to view platform sites.";
            } else if (error instanceof ApiError && error.isUnauthorized) {
            errorMessage = "Your session has expired. Please sign in again.";
            } else {
            errorMessage = "Could not load sites. Please try again when the API is available.";
            }
        }
        }
    }

    const activeCount = sites.filter((site) => site.status === "active").length;
    const deactivatedCount = sites.filter(
        (site) => site.status === "deactivated",
    ).length;
    const activeSessions = sites.reduce(
        (total, site) => total + site.activeSessionCount,
        0,
    );

    return (
        <main className="mx-auto max-w-6xl px-4 py-10">
        <header>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">
            Platform Sites
            </h1>
            <p className="mt-1 text-ink-600">
            Review parking sites, their owners, status, and current activity.
            </p>
        </header>

        {PREVIEW_MODE && (
            <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Preview only — live API data is not connected yet. All site and owner
            records shown here are fictional examples for frontend development.
            </div>
        )}
        {!PREVIEW_MODE && errorMessage && (
            <div
            role="alert"
            className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
            {errorMessage}
            </div>
        )}

        <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink-900">Sites overview</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Displayed sites" value={sites.length} />
            <SummaryCard label="Active sites" value={activeCount} />
            <SummaryCard label="Deactivated sites" value={deactivatedCount} />
            <SummaryCard label="Active sessions" value={activeSessions} />
            </div>
        </section>

        <section className="mt-8 surface rounded-lg p-5">
            <h2 className="text-lg font-semibold text-ink-900">Search and filter</h2>
            <p className="mt-1 text-sm text-ink-600">
            Search filters the records currently displayed; status and owner ID
            are sent to the API when live data is enabled.
            </p>
            <form
            method="GET"
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_120px_auto_auto] lg:items-end"
            >
            <div>
                <label
                htmlFor="search"
                className="mb-1.5 block text-sm font-medium text-ink-700"
                >
                Site, code, or owner
                </label>
                <input
                id="search"
                name="search"
                type="search"
                maxLength={120}
                defaultValue={search}
                placeholder="Search loaded records..."
                className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                />
            </div>
            <div>
                <label
                htmlFor="status"
                className="mb-1.5 block text-sm font-medium text-ink-700"
                >
                Site status
                </label>
                <select
                id="status"
                name="status"
                defaultValue={status}
                className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
                </select>
            </div>
            <div>
                <label
                htmlFor="ownerId"
                className="mb-1.5 block text-sm font-medium text-ink-700"
                >
                Owner ID (optional)
                </label>
                <input
                id="ownerId"
                name="ownerId"
                defaultValue={ownerId}
                placeholder="Owner UUID"
                className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                />
            </div>
            <div>
                <label
                htmlFor="limit"
                className="mb-1.5 block text-sm font-medium text-ink-700"
                >
                Page size
                </label>
                <select
                id="limit"
                name="limit"
                defaultValue={String(limit)}
                className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                </select>
            </div>
            <button
                type="submit"
                className="h-10 rounded-md bg-ink-950 px-4 text-sm font-medium text-white transition hover:opacity-90"
            >
                Apply
            </button>
            <a
                href={`/${locale}/admin/sites`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-ink-200 px-4 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
            >
                Reset
            </a>
            </form>
        </section>

        <section className="mt-8 surface overflow-hidden rounded-lg">
            <div className="flex flex-col gap-1 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h2 className="text-lg font-semibold text-ink-900">Site directory</h2>
                <p className="mt-1 text-sm text-ink-600">
                Ownership, status, currency, timezone, and active-session count.
                </p>
            </div>
            <p className="text-sm text-ink-500">{sites.length} displayed</p>
            </div>

            {errorMessage && !PREVIEW_MODE ? (
            <div className="p-8 text-center">
                <h3 className="font-medium text-ink-900">Unable to load sites</h3>
                <p className="mt-1 text-sm text-ink-600">
                Check your session and try again when the API is available.
                </p>
            </div>
            ) : sites.length === 0 ? (
            <div className="p-8 text-center">
                <h3 className="font-medium text-ink-900">No sites found</h3>
                <p className="mt-1 text-sm text-ink-600">
                Try another search term or filter.
                </p>
            </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-ink-50">
                    <tr>
                    <th className="px-5 py-3 font-medium text-ink-600">Site</th>
                    <th className="px-5 py-3 font-medium text-ink-600">Owner</th>
                    <th className="px-5 py-3 font-medium text-ink-600">Status</th>
                    <th className="px-5 py-3 font-medium text-ink-600">Currency / timezone</th>
                    <th className="px-5 py-3 font-medium text-ink-600">Active sessions</th>
                    <th className="px-5 py-3 font-medium text-ink-600">Date created</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                    {sites.map((site) => (
                    <tr key={site.id} className="transition hover:bg-ink-50">
                        <td className="px-5 py-4">
                        <p className="font-medium text-ink-900">{site.name}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{site.code}</p>
                        </td>
                        <td className="px-5 py-4">
                        <p className="font-medium text-ink-900">
                            {site.owner.displayName}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-600">
                            {site.owner.email}
                        </p>
                        </td>
                        <td className="px-5 py-4">
                        <StatusBadge status={site.status} />
                        </td>
                        <td className="px-5 py-4">
                        <p className="text-ink-900">{site.currency}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                            {site.timeZone}
                        </p>
                        </td>
                        <td className="px-5 py-4 tabular-nums text-ink-700">
                        {site.activeSessionCount}
                        </td>
                        <td className="px-5 py-4 text-ink-600">
                        {formatDate(site.createdAt, locale)}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            )}

            {!PREVIEW_MODE && hasMore && nextCursor && (
            <div className="flex justify-end border-t border-ink-100 px-5 py-4">
                <a
                href={buildHref(locale, {
                    search,
                    status: status !== "all" ? status : undefined,
                    ownerId,
                    limit: String(limit),
                    cursor: nextCursor,
                })}
                className="inline-flex h-10 items-center justify-center rounded-md border border-ink-200 px-4 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
                >
                Next page
                </a>
            </div>
            )}
        </section>

        <p className="mt-6 text-xs text-ink-500">
            {PREVIEW_MODE
            ? "Preview only — all displayed records are fictional. Site creation and deactivation are not enabled in this page yet."
            : "Site records are loaded from the admin API. Deactivation is a soft delete and requires a reason; site history is retained."}
        </p>
        </main>
    );
    }

    function SummaryCard({ label, value }: { label: string; value: number }) {
    return (
        <article className="surface rounded-lg p-5">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        <p className="mt-3 text-3xl font-semibold text-ink-950">{value}</p>
        <p className="mt-2 text-xs text-ink-500">Current displayed records</p>
        </article>
    );
    }

    function StatusBadge({ status }: { status: SiteStatus }) {
    const classes =
        status === "active"
        ? "bg-green-50 text-green-700"
        : "bg-ink-100 text-ink-700";

    return (
        <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}
        >
        {status === "active" ? "Active" : "Deactivated"}
        </span>
    );
    }

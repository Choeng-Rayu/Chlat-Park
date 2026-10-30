import { setRequestLocale } from "next-intl/server";

interface Owner {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  suspended: boolean;
  siteCount: number;
  createdAt: string;
}

interface OwnersPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
  }>;
}

// Fictional examples for frontend preview only.
const PREVIEW_OWNERS: Owner[] = [
  {
    id: "preview-owner-1",
    userId: "preview-user-1",
    email: "owner.one@example.com",
    displayName: "Example Owner One",
    suspended: false,
    siteCount: 3,
    createdAt: "2026-09-10T08:00:00.000Z",
  },
  {
    id: "preview-owner-2",
    userId: "preview-user-2",
    email: "owner.two@example.com",
    displayName: "Example Owner Two",
    suspended: true,
    siteCount: 1,
    createdAt: "2026-09-15T08:00:00.000Z",
  },
];

function formatDate(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(locale);
}

export default async function AdminOwnersPage({
  params,
  searchParams,
}: OwnersPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const queryParams = await searchParams;
  const search = (queryParams.search ?? "").trim().slice(0, 120);

  const requestedStatus = queryParams.status ?? "all";
  const status =
    requestedStatus === "active" || requestedStatus === "suspended"
      ? requestedStatus
      : "all";

  const owners = PREVIEW_OWNERS.filter((owner) => {
    const term = search.toLowerCase();

    const matchesSearch =
      !term ||
      owner.displayName.toLowerCase().includes(term) ||
      owner.email.toLowerCase().includes(term);

    const matchesStatus =
      status === "all" ||
      (status === "active" && !owner.suspended) ||
      (status === "suspended" && owner.suspended);

    return matchesSearch && matchesStatus;
  });

  const activeCount = owners.filter((owner) => !owner.suspended).length;
  const suspendedCount = owners.filter((owner) => owner.suspended).length;
  const resetHref = `/${locale}/admin/owners`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-950">
          Platform Owners
        </h1>
        <p className="mt-1 text-ink-600">
          Manage platform owners and view their managed sites.
        </p>
      </header>

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Preview only — live API data is not connected yet. The owner records
        below are fictional examples for frontend development and must not be
        interpreted as actual platform records or statistics.
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink-900">Owners overview</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            label="Displayed owners"
            value={owners.length}
            description="Records matching the current filters"
          />
          <SummaryCard
            label="Active owners"
            value={activeCount}
            description="Owners not marked as suspended"
          />
          <SummaryCard
            label="Suspended owners"
            value={suspendedCount}
            description="Owners currently marked as suspended"
          />
        </div>
      </section>

      <section className="mt-8 surface rounded-lg p-5">
        <h2 className="text-lg font-semibold text-ink-900">
          Search and filter
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Find preview owners by display name or email address.
        </p>

        <form
          method="GET"
          className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto] sm:items-end"
        >
          <div>
            <label
              htmlFor="search"
              className="mb-1.5 block text-sm font-medium text-ink-700"
            >
              Name or email
            </label>
            <input
              id="search"
              name="search"
              type="search"
              maxLength={120}
              defaultValue={search}
              placeholder="Search owners..."
              className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
            />
          </div>

          <div>
            <label
              htmlFor="status"
              className="mb-1.5 block text-sm font-medium text-ink-700"
            >
              Owner status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <button
            type="submit"
            className="h-10 rounded-md bg-ink-950 px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Apply filters
          </button>

          <a
            href={resetHref}
            className="inline-flex h-10 items-center justify-center rounded-md border border-ink-200 px-4 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
          >
            Reset
          </a>
        </form>
      </section>

      <section className="mt-8 surface overflow-hidden rounded-lg">
        <div className="flex flex-col gap-1 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              Owner directory
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Owner details, managed site count, and account status.
            </p>
          </div>

          <p className="text-sm text-ink-500">{owners.length} displayed</p>
        </div>

        {owners.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="font-medium text-ink-900">No owners found</h3>
            <p className="mt-1 text-sm text-ink-600">
              Try another search term or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-ink-50">
                <tr>
                  <th className="px-5 py-3 font-medium text-ink-600">Owner</th>
                  <th className="px-5 py-3 font-medium text-ink-600">
                    Managed sites
                  </th>
                  <th className="px-5 py-3 font-medium text-ink-600">Status</th>
                  <th className="px-5 py-3 font-medium text-ink-600">
                    Date created
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-ink-100">
                {owners.map((owner) => (
                  <tr
                    key={owner.id}
                    className="transition hover:bg-ink-50"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-ink-900">
                        {owner.displayName}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-600">
                        {owner.email}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-ink-700">
                      {owner.siteCount}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          owner.suspended
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {owner.suspended ? "Suspended" : "Active"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-ink-600">
                      {formatDate(owner.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-ink-500">
        Preview only — all displayed owner records are fictional. Live owner
        data and owner status changes are not connected or enabled.
      </p>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <article className="surface rounded-lg p-5">
      <p className="text-sm font-medium text-ink-600">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink-950">{value}</p>
      <p className="mt-2 text-xs text-ink-500">{description}</p>
    </article>
  );
}

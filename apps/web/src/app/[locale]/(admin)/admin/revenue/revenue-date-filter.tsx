
    "use client";

    import { useState } from "react";

    function toDateInputValue(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
    }

    export default function RevenueDateFilter() {
    const today = new Date();

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const [from, setFrom] = useState(
        toDateInputValue(thirtyDaysAgo)
    );
    const [to, setTo] = useState(toDateInputValue(today));
    const [error, setError] = useState("");
    const [appliedRange, setAppliedRange] = useState("");

    function applyRange() {
        if (!from || !to) {
        setError("Please select both dates.");
        setAppliedRange("");
        return;
        }

        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T00:00:00`);

        const days =
        (end.getTime() - start.getTime()) / 86_400_000;

        if (days < 0) {
        setError("The start date must be before the end date.");
        setAppliedRange("");
        return;
        }

        if (days > 366) {
        setError("Choose a date range of no more than 366 days.");
        setAppliedRange("");
        return;
        }

        setError("");
        setAppliedRange(`${from} to ${to}`);
    }

    return (
        <section className="mt-6 rounded-lg border border-ink-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
            From

            <input
                type="date"
                value={from}
                max={to || toDateInputValue(today)}
                onChange={(event) => {
                setFrom(event.target.value);
                setAppliedRange("");
                setError("");
                }}
                className="rounded-md border border-ink-300 px-3 py-2"
            />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink-700">
            To

            <input
                type="date"
                value={to}
                min={from || undefined}
                max={toDateInputValue(today)}
                onChange={(event) => {
                setTo(event.target.value);
                setAppliedRange("");
                setError("");
                }}
                className="rounded-md border border-ink-300 px-3 py-2"
            />
            </label>

            <button
            type="button"
            onClick={applyRange}
            className="rounded-md bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
            Apply range
            </button>
        </div>

        {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
            </p>
        )}

        {appliedRange && (
            <p role="status" className="mt-3 text-sm text-ink-600">
            Selected range: {appliedRange}
            </p>
        )}

        <p className="mt-3 text-xs text-ink-500">
            Defaults to the last 30 days. Maximum range: 366 days.
            This filter is not connected to live API data yet.
        </p>
        </section>
    );
    }

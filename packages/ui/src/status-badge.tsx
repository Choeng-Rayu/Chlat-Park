import * as React from "react";
import { cx, TONE_CLASSES, type StatusBadgeProps, type Tone } from "./types.js";

/**
 * The status badge.
 *
 * Renders a domain status (a session status, a payment status, a ticket
 * status) as a small pill. When no tone is given the tone is inferred from
 * the label, so a caller can drop in a raw status string and still get a
 * sensible colour.
 */

/** The status → tone map for the domain's known statuses. */
const STATUS_TONES: Record<string, Tone> = {
  // parking sessions
  PENDING_CLAIM: "info",
  ACTIVE: "success",
  EXIT_PENDING: "warning",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
  MANUAL_REVIEW: "danger",

  // payments
  UNPAID: "warning",
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  EXEMPT: "info",
  VOIDED: "neutral",

  // tickets
  ISSUED: "success",
  REVOKED: "danger",
  EXPIRED: "neutral",

  // sites
  DEACTIVATED: "danger",
  INACTIVE: "warning",
};

/**
 * Infer a tone from a status label.
 *
 * Unknown labels fall back to `neutral`, and a label that merely *contains* a
 * known status (e.g. `EXIT_COMPLETED`) still matches.
 */
export function inferTone(label: string): Tone {
  const upper = label.toUpperCase();

  if (upper in STATUS_TONES) {
    return STATUS_TONES[upper] as Tone;
  }

  for (const [status, tone] of Object.entries(STATUS_TONES)) {
    if (upper.includes(status)) {
      return tone;
    }
  }

  return "neutral";
}

export function StatusBadge({ label, tone, showDot = false, className }: StatusBadgeProps) {
  const resolved = tone ?? inferTone(label);

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASSES[resolved],
        className,
      )}
    >
      {showDot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      ) : null}
      {label}
    </span>
  );
}

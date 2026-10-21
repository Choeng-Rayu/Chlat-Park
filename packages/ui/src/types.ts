import type * as React from "react";
import type { ReactNode } from "react";

/**
 * The props shared by the primitives in this package.
 *
 * Every component is a plain function component with no framework coupling —
 * no Next.js, no context, no data fetching. They are presentational by
 * design, so they can be rendered in a server component, a client component,
 * a test, or a story.
 */

/** A class name that may be appended to a component's own classes. */
export type ClassValue = string | undefined | null | false;

/** Joins class names, dropping the empty ones. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

/** The visual tone of a badge or a callout. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** The tone → Tailwind class map, shared by the primitives. */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  info: "bg-sky-100 text-sky-800 ring-sky-200",
  success: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-100 text-amber-900 ring-amber-200",
  danger: "bg-red-100 text-red-800 ring-red-200",
};

/** The props of the `Button` primitive. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The visual weight. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** The button size. */
  size?: "sm" | "md" | "lg";
  /** Renders a spinner and disables the button. */
  loading?: boolean;
  /** The button content. */
  children?: ReactNode;
}

/** The props of the `Card` primitive. */
export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** The card heading. */
  title?: ReactNode;
  /** A short description under the heading. */
  description?: ReactNode;
  /** Actions rendered in the card header. */
  actions?: ReactNode;
  /** The card body. */
  children?: ReactNode;
}

/** The props of the `StatusBadge` primitive. */
export interface StatusBadgeProps {
  /** The status label. */
  label: string;
  /** The visual tone. Inferred from the label when omitted. */
  tone?: Tone;
  /** A dot in front of the label. */
  showDot?: boolean;
  /** Extra classes. */
  className?: ClassValue;
}

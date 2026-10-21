import * as React from "react";
import { cx, type ButtonProps } from "./types.js";

/**
 * The button primitive.
 *
 * A plain `<button>` with a variant, a size and a loading state. It renders
 * no markup of its own beyond the classes, so it can be dropped into a form
 * or used as a trigger for anything.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800 focus-visible:outline-neutral-900",
    secondary:
      "bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 focus-visible:outline-neutral-500",
    ghost: "text-neutral-700 hover:bg-neutral-100 focus-visible:outline-neutral-400",
    danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600",
  };

  const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/** The spinner shown while a button is loading. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

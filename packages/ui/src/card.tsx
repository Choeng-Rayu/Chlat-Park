import * as React from "react";
import { cx, type CardProps } from "./types.js";

/**
 * The card primitive.
 *
 * A titled surface with an optional description and a header action area.
 * The body is rendered only when there is something to put in it, so a card
 * never renders an empty `<div>`.
 */
export function Card({ title, description, actions, children, className, ...rest }: CardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <div
      className={cx(
        "overflow-hidden rounded-lg bg-white ring-1 ring-neutral-200 shadow-sm",
        className,
      )}
      {...rest}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate text-base font-semibold text-neutral-900">{title}</h2>
            ) : null}
            {description ? <p className="mt-1 text-sm text-neutral-600">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className="px-5 py-4">{children}</div> : null}
    </div>
  );
}

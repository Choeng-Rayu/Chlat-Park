import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * The locale-aware navigation helpers.
 *
 * Every internal link in the app must use `Link` from this module rather
 * than `next/link`. It adds the locale prefix automatically, so a link
 * written as `/guard/login` becomes `/en/guard/login` or `/km/guard/login`
 * depending on the current locale — and it can never produce a broken link
 * that drops the locale.
 *
 * The `Link` from here is also typed against the routing configuration, so a
 * typo in a path is a type error.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

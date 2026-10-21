import createMiddleware from "next-intl/middleware";

import { routing } from "@/lib/i18n/routing";

/**
 * The locale router.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` file
 * convention is deprecated). The proxy runs on the **Node.js runtime** only,
 * which is what `next-intl`'s middleware needs.
 *
 * It rewrites a request that carries no locale prefix into one that does:
 *
 * ```
 * /            →  /en            (or /km, from Accept-Language)
 * /guard/login →  /en/guard/login
 * ```
 *
 * A request that already carries a known locale is passed through
 * untouched.
 */
export default createMiddleware(routing);

/**
 * The matcher.
 *
 * Everything except Next.js internals, the API's own assets and any file
 * with an extension (an image, a `.well-known` file, a robots.txt).
 */
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

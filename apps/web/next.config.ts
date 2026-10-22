import createNextIntlPlugin from "next-intl/plugin";

import type { NextConfig } from "next";

/**
 * The Next.js configuration.
 *
 * `transpilePackages` lets the app consume the workspace packages' TypeScript
 * sources directly, so a change in `@chlat/contracts` is picked up without a
 * rebuild of the package.
 *
 * Note: Next 16 removed the `eslint` config key — linting now runs as a
 * separate step (`pnpm lint`), which is what the CI workflow does. Do not
 * run `next lint`.
 *
 * `createNextIntlPlugin` points next-intl at `src/lib/i18n/request.ts` and
 * at the request-config path used by the proxy. It must wrap the config
 * object, so the plugin is applied to the exported configuration.
 */
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@chlat/contracts", "@chlat/api-client"],
  output: "standalone",
  typedRoutes: true,
};

export default withNextIntl(nextConfig);

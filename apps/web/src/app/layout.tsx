import type { Metadata, Viewport } from "next";

import "../styles/globals.css";

/**
 * The root layout.
 *
 * It is a **pass-through**: the `<html>` and `<body>` elements are rendered
 * by the locale layout (`[locale]/layout.tsx`), because only that layout
 * knows the locale and can therefore set the `lang` attribute correctly.
 *
 * A root layout that hard-codes `lang="en"` would tell a screen reader that
 * the Khmer page is English — a real accessibility bug, not a cosmetic one.
 *
 * The metadata still lives here so it applies to every route.
 */
export const metadata: Metadata = {
  title: {
    default: "Chlat-Park — E-Ticket Parking",
    template: "%s · Chlat-Park",
  },
  description:
    "Chlat-Park is an e-ticket parking system: manual, guard-assisted motorcycle parking entry and exit, where a paper ticket is replaced by a QR-linked e-ticket.",
  applicationName: "Chlat-Park",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3d2e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

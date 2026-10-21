import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isLocale } from "@/lib/i18n/config";

/**
 * The locale layout.
 *
 * It owns the `lang` attribute on `<html>` (the root layout cannot, because
 * it does not know the locale) and it provides the translations to the
 * client.
 *
 * `setRequestLocale` opts the route into static rendering: without it
 * next-intl makes the whole `[locale]` tree dynamic, because the locale
 * comes from the request. Every page under `[locale]` must call it.
 */
export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "km" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // An unknown locale is a 404, not a fallback: a mistyped URL should not
  // silently render in another language.
  if (!isLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <SiteHeader locale={locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

/**
 * The page metadata, translated.
 *
 * `getTranslations` is awaited here because Next.js 16 makes every request
 * API asynchronous.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "app" });

  return {
    title: {
      default: `${t("name")} — ${t("tagline")}`,
      template: `%s · ${t("name")}`,
    },
    description: t("description"),
  };
}

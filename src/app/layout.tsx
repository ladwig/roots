import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { messages } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getT } from "@/i18n/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: "Roots", description: t("meta.description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ponytail: one boundary so every page may read the session/params at request time (Cache Components).
            Add per-route static shells + finer boundaries where load speed matters (public pages first). */}
        <I18nProvider locale={locale} messages={messages[locale]}>
          <TooltipProvider>
            <Suspense>{children}</Suspense>
          </TooltipProvider>
          <Toaster position="top-center" />
        </I18nProvider>
      </body>
    </html>
  );
}

// The language (cookie / Accept-Language) is read at request time for <html lang>.
export const instant = false;

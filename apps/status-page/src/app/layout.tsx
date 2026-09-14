import { cn } from "@openstatus/ui/lib/utils";
import type { Metadata } from "next";

import "./globals.css";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import LocalFont from "next/font/local";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { TailwindIndicator } from "../components/tailwind-indicator";
import { TRPCReactProvider } from "../lib/trpc/client";
import { defaultMetadata } from "./metadata";

const cal = LocalFont({
  src: "../../public/fonts/CalSans-SemiBold.ttf",
  variable: "--font-cal-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const commitMono = LocalFont({
  src: [
    {
      path: "../../public/fonts/CommitMono-400-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/CommitMono-400-Italic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/CommitMono-700-Regular.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/CommitMono-700-Italic.otf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-commit-mono",
});

export const metadata: Metadata = defaultMetadata;

// export const dynamic = "error";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={locale === "fa" ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          cal.variable,
          commitMono.variable,
          "antialiased",
        )}
      >
        <NuqsAdapter>
          <TRPCReactProvider>
            {children}
            <TailwindIndicator />
          </TRPCReactProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}

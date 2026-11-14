import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AccountStatus from "../components/AccountStatus";
import SiteNavigation from "../components/SiteNavigation";
import { LanguageProvider } from "../components/LanguageProvider";
import LanguageSwitcher from "../components/LanguageSwitcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Bible Study",
  description:
    "Join interactive Bible studies, explore Scripture, and save your personal study notes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-4 px-6 py-2">
              <LanguageSwitcher />
              <AccountStatus />
            </div>
          </div>
          <Suspense fallback={<nav aria-label="Main navigation" className="h-16 border-b border-slate-200 bg-white" />}>
            <SiteNavigation />
          </Suspense>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}

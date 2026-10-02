import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import SiteHeader from "@/components/SiteHeader";
import RewardToaster from "@/components/RewardToaster";
import Onboarding from "@/components/Onboarding";
import RoomGuard from "@/components/RoomGuard";
import InviteToaster from "@/components/InviteToaster";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: "fam-io — Arkadaşlarla dublaj", template: "%s · fam-io" },
  description: "Arkadaşlarınla film sahnelerini seslendir, finali birlikte izle, videoyu indir.",
  openGraph: { siteName: "fam-io", locale: "tr_TR", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0a0a0b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <RewardToaster />
        <InviteToaster />
        <RoomGuard />
        <Onboarding />
        <footer className="border-t border-line">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 text-xs text-muted sm:px-6">
            <span>fam-io · arkadaşlar arası dublaj</span>
            <span>
              Developed by <span className="text-fg-2">Reawen</span>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

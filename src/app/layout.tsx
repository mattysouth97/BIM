import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif used for the Twin-stage release identity, hero numbers, and
// panel titles. Variable axes enable instrument-grade precision glyphs.
const fraunces = Fraunces({
  variable: "--font-display-release",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

// Distinctive data-feed mono — used for metric readouts on the Twin stage.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "건축물대장 | Building Ledger",
  description:
    "한국 건축물대장 정보 조회 서비스 - Korea Building Ledger information lookup powered by data.go.kr",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, JetBrains_Mono, Hahmlet } from "next/font/google";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import { HtmlLangSync } from "@/components/layout/html-lang-sync";
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

const hahmlet = Hahmlet({
  variable: "--font-ko-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BIMFIT | 건물 에너지 진단",
  description:
    "건물 모델을 검증하고 에너지 성능, 손실 위치, 개선 대안을 한 흐름에서 진단합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${hahmlet.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {/* P2-06: sync <html lang> to the language store (static ko default). */}
          <HtmlLangSync />
          <Header />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

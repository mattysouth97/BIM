import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, JetBrains_Mono, Hahmlet } from "next/font/google";
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

const hahmlet = Hahmlet({
  variable: "--font-ko-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BIMFIT | 대장에서 트윈까지",
  description:
    "건축물대장 또는 도면을 넣으면 그 건물의 3D 트윈이 열립니다. 에너지 숫자와 그린리모델링 투자 답이 같은 건물에서 나옵니다.",
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
        <link
          rel="preload"
          as="image"
          href="/landing/promise-plate.jpg"
          media="(min-width: 768px)"
        />
        <link
          rel="preload"
          as="image"
          href="/landing/promise-mobile.jpg"
          media="(max-width: 767px)"
        />
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

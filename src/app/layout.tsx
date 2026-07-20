import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "그린리모델링 시뮬레이터 | GreenRetrofit Simulator",
  description:
    "한국 건축물대장 데이터를 3D 디지털 트윈으로 변환하고 에너지 개보수 투자 회수(NPV·IRR·회수기간)를 시뮬레이션합니다 — Korean building-ledger data into 3D digital twins with energy-retrofit ROI simulation, powered by data.go.kr.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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

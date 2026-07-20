// src/app/building/[id]/layout.tsx
// Route-level font loader for Twin-stage display fonts (Fraunces + JetBrains Mono).
// Loading here instead of the root layout means the landing route ships zero
// display-font payload — these fonts are only requested on /building/[id] routes.

import { Fraunces, JetBrains_Mono } from "next/font/google";

// Editorial serif: Twin-stage release identity, hero numbers, panel titles.
const fraunces = Fraunces({
  variable: "--font-display-release",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

// Distinctive data-feed mono: metric readouts on the Twin stage.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
});

export default function BuildingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fraunces.variable} ${jetbrainsMono.variable}`}>
      {children}
    </div>
  );
}

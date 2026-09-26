import type { Metadata } from "next";
import { Pixelify_Sans, Jersey_20 } from "next/font/google";
import "./globals.css";

// Pixelify Sans is a variable font (400-700): no weight needed. Jersey 20 only
// ships weight 400. Both are exposed as CSS variables so globals.css can pick
// which one applies per element (Pixelify for panel text, Jersey for numbers).
const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const jersey20 = Jersey_20({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-num",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jevaga",
  description: "Jev flies a Galaga-style ship in real time while Nemotron on Nebius plans its moves.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixelifySans.variable} ${jersey20.variable}`}>
      <body>{children}</body>
    </html>
  );
}

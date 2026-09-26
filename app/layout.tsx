import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jevaga",
  description: "Jev flies a Galaga-style ship in real time while Nemotron on Nebius plans its moves.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

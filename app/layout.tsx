import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go Frog Go",
  description: "Jev plays a frog crossing an endless road. Nemotron teaches it after every run.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

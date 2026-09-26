"use client";

import dynamic from "next/dynamic";

// The game reads the URL and random seeds on first render, so it only runs in the browser.
const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Home() {
  return <Game />;
}

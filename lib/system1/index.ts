import { fake } from "./fake";
import { jev } from "./jev";
import type { System1 } from "./types";

// SYSTEM1=jev (default) or SYSTEM1=fake for offline work.
export function system1(): System1 {
  return process.env.SYSTEM1 === "fake" ? fake : jev;
}

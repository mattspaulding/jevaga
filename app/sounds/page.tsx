import { notFound } from "next/navigation";
import SoundLab from "@/components/SoundLab";

// The sound panel's audition page: every candidate set side by side, for
// picking by ear. A development tool, so it doesn't exist in production.
export default function SoundsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SoundLab />;
}

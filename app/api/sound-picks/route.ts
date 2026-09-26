import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Saves Matt's picks from /sounds to sound-lab/picks.json (gitignored), where
// the next step reads them. Development only.
const FILE = join(process.cwd(), "sound-lab", "picks.json");
const dev = process.env.NODE_ENV !== "production";

export async function GET() {
  if (!dev) return new Response(null, { status: 404 });
  const text = await readFile(FILE, "utf8").catch(() => "{}");
  return Response.json(JSON.parse(text));
}

export async function POST(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const body = (await request.json().catch(() => null)) as { picks?: unknown; notes?: unknown } | null;
  const picks = body?.picks;
  const notes = body?.notes;
  const ok =
    !!picks &&
    typeof picks === "object" &&
    Object.entries(picks).every(([k, v]) => k.length < 40 && typeof v === "string" && v.length < 40) &&
    (notes === undefined || (typeof notes === "object" && notes !== null && Object.values(notes).every((v) => typeof v === "string" && v.length < 2000)));
  if (!ok) return Response.json({ error: "Bad request" }, { status: 400 });
  await mkdir(join(process.cwd(), "sound-lab"), { recursive: true });
  const saved = { picks, notes: notes ?? {}, savedAt: new Date().toISOString() };
  await writeFile(FILE, JSON.stringify(saved, null, 2));
  return Response.json(saved);
}

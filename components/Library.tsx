"use client";

import { useEffect, useRef, useState } from "react";
import { drawWeaponIcon } from "@/lib/game/render";
import { BODY, drawSprite, type SpriteName } from "@/lib/game/sprites";
import { LIBRARY } from "@/lib/library";

// The Enemy Library: a page per enemy, with its sprites, name, lore, how it
// attacks, its weapon, how to spot it coming and when it first shows up.
// ← → turn the page, Esc closes.

const SCALE = 5; // sprite pixels to screen pixels
const FLAP_MS = 330;

// One enemy's poses: the formation frames flapping, the dive pose, and its weapon's icon.
function Portrait({ kind, weapon }: { kind: 0 | 1 | 2; weapon: "beam" | "fan" | "wingmen" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const ctx = ref.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0b0d1c";
      ctx.fillRect(0, 0, 60, 22);
      drawSprite(ctx, `enemy${kind}-${frame % 2 === 0 ? "a" : "b"}` as SpriteName, 10, 11, BODY.enemy[kind]);
      drawSprite(ctx, `dive${kind}` as SpriteName, 30, 11, BODY.enemy[kind]);
      drawWeaponIcon(ctx, weapon, 50, 11, 2);
      frame++;
    };
    draw();
    const id = setInterval(draw, FLAP_MS);
    return () => clearInterval(id);
  }, [kind, weapon]);
  return <canvas ref={ref} width={60} height={22} className="libPortrait" style={{ width: 60 * SCALE, height: 22 * SCALE }} aria-hidden="true" />;
}

export default function Library({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const close = useRef<HTMLButtonElement>(null);
  const p = LIBRARY[page];

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setPage((n) => (n + 1) % LIBRARY.length);
      if (e.key === "ArrowLeft") setPage((n) => (n + LIBRARY.length - 1) % LIBRARY.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="libBackdrop" onClick={onClose}>
      <section className="win winNeutral library" role="dialog" aria-modal="true" aria-labelledby="libTitle" onClick={(e) => e.stopPropagation()}>
        <div className="libHead">
          <h2 id="libTitle">ENEMY LIBRARY</h2>
          <button ref={close} className="btn btnQuiet libClose" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <div className="libTabs" role="tablist" aria-label="Enemies">
          {LIBRARY.map((e, i) => (
            <button key={e.name} role="tab" aria-selected={i === page} className={`libTab ${i === page ? "active" : ""}`} onClick={() => setPage(i)}>
              {e.name.toUpperCase()}
            </button>
          ))}
        </div>
        <article className="libPage" role="tabpanel" aria-label={p.name}>
          <Portrait kind={p.kind} weapon={p.weapon.id} />
          <h3 className="libName">{p.name}</h3>
          <p className="libSpecies">{p.species}</p>
          <p className="libLore">{p.lore}</p>
          <h4>How it attacks</h4>
          <p>{p.attack}</p>
          <h4>Its weapon: {p.weapon.name}</h4>
          <p>{p.weapon.text}</p>
          <h4>Spot it coming</h4>
          <p>{p.spot}</p>
          <h4>First seen</h4>
          <p>{p.firstSeen}</p>
        </article>
        <p className="libHint">← → to turn the page · Esc to close</p>
      </section>
    </div>
  );
}

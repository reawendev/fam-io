"use client";

/**
 * Mağaza isim stilleri (Discord'un görünen ad stilleri gibi): metalik / parlayan / alevli / akan renkli yazı.
 * Yazıya kırpılmış hareketli gradyan + yumuşak ışıltı + harflerin üstünde çakan küçük yıldızlar.
 * Görünüş globals.css'te (.name-style, .ns-*). Aurora ve Glitch ayrı bileşenler.
 */

const SPARKS: Record<string, { left: string; top: string; delay: string }[]> = {
  altin: [
    { left: "12%", top: "-10%", delay: "0.2s" },
    { left: "78%", top: "45%", delay: "1.4s" },
  ],
  parilti: [
    { left: "6%", top: "-12%", delay: "0s" },
    { left: "48%", top: "50%", delay: "0.8s" },
    { left: "88%", top: "-8%", delay: "1.5s" },
  ],
  ates: [
    { left: "20%", top: "10%", delay: "0s" },
    { left: "55%", top: "5%", delay: "0.7s" },
    { left: "85%", top: "15%", delay: "1.2s" },
  ],
  gokkusagi: [
    { left: "30%", top: "-10%", delay: "0.5s" },
    { left: "92%", top: "40%", delay: "1.6s" },
  ],
};

export const NAME_STYLES = ["name_altin", "name_parilti", "name_ates", "name_gokkusagi"];

export function NameStyle({ id, name, className }: { id: string; name: string; className?: string }) {
  const v = id.replace("name_", "");
  return (
    <span className={`name-style ns-${v}${className ? " " + className : ""}`}>
      <span className="ns-text">{name}</span>
      {(SPARKS[v] ?? []).map((s, i) => (
        <i key={i} className="ns-spark" style={{ left: s.left, top: s.top, animationDelay: s.delay }} aria-hidden />
      ))}
    </span>
  );
}

"use client";

import AwardPlaque from "./AwardPlaque";
import { usePlaque } from "@/lib/shop";

/** Profilde takılı plaket: görünüşü (yazı, renkler) yönetim panelinden gelir */
export function EquippedPlaque({ id, className }: { id: string; className?: string }) {
  const look = usePlaque(id);
  if (!look) return null;
  return <AwardPlaque eyebrow={look.eyebrow} title={look.title} colors={look.colors} className={className} />;
}

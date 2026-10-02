"use client";

import { Gamepad2 } from "lucide-react";
import ActiveRooms from "@/components/ActiveRooms";
import { ButtonLink, PageHeader } from "@/components/ui";

/** Aktif odalar: "Herkese açık" lobiler. Gizli lobiler sadece kodu / linki olanlara görünür. */
export default function Odalar() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Canlı"
        title="Aktif odalar"
        description="Herkese açık lobiler burada. Lobideki bir odaya tıkla, hemen katıl. Gizli lobiler listede görünmez; onlara sadece kod ya da linkle girilir."
        actions={
          <ButtonLink href="/oyna" variant="primary" size="sm" icon={<Gamepad2 className="size-4" />}>
            Oda kur
          </ButtonLink>
        }
      />
      <ActiveRooms />
    </main>
  );
}

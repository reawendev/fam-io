"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getActiveRoom, setActiveRoom } from "@/lib/roomSession";
import { rpcBeacon, sb } from "@/lib/supabase";

/**
 * Oda sayfasından çıkılınca odayı bırakır (layout'ta, her sayfada çalışır):
 * - Uygulama içinde başka sayfaya geçince (geri tuşu dahil): lobide / finaldeysen odadan ayrılır,
 *   oyun sürüyorsa "uzaktayım" der (karakterin hemen gitmesin; dönmezsen birazdan düşersin).
 * - Sekme / tarayıcı kapanınca: "uzaktayım" (15 sn içinde dönmezsen düşersin; sayfa yenilendiyse kalırsın).
 */
export default function RoomGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const a = getActiveRoom();
    if (!a) return;
    if (pathname.toLowerCase().startsWith(`/oda/${a.code.toLowerCase()}`)) return;
    setActiveRoom(null);
    if (!a.inRoom) return;
    if (a.status === "lobby" || a.status === "finale") sb().rpc("leave_room", { p_room: a.id }).then(() => {});
    else sb().rpc("room_away", { p_room: a.id }).then(() => {});
  }, [pathname]);

  useEffect(() => {
    const onHide = () => {
      const a = getActiveRoom();
      if (a?.inRoom) rpcBeacon("room_away", { p_room: a.id });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return null;
}

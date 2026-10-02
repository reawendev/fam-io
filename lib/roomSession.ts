"use client";

import type { RoomStatus } from "./types";

/**
 * Şu an açık olan oda sayfası. RoomGuard (layout) sayfa değişince / sekme kapanınca buna bakarak
 * odadan ayrılır ya da "uzaktayım" der; böylece kapatılan sayfalar odayı açık tutmaz.
 */
export type ActiveRoom = { id: string; code: string; status: RoomStatus; inRoom: boolean };

let active: ActiveRoom | null = null;

export function setActiveRoom(a: ActiveRoom | null) {
  active = a;
}

export function getActiveRoom() {
  return active;
}

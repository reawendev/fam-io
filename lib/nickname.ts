"use client";

import { useSyncExternalStore } from "react";

const KEY = "famio:nick";
const listeners = new Set<() => void>();

export function getNick(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setNick(n: string) {
  try {
    localStorage.setItem(KEY, n.slice(0, 30));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Takma ad; header ve sayfalar arasında senkron kalır. */
export function useNick(): [string, (n: string) => void] {
  const nick = useSyncExternalStore(subscribe, getNick, () => "");
  return [nick, setNick];
}

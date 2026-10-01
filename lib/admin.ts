"use client";

import { useEffect, useState } from "react";
import { useMe } from "./auth";
import { sb } from "./supabase";

/** Yönetici mi? ("kurucu" rozeti). Oturum başına bir kez sorulur. */
const cache = new Map<string, Promise<boolean>>();

export function isAdmin(uid: string) {
  if (!cache.has(uid)) {
    cache.set(
      uid,
      Promise.resolve(sb().rpc("is_admin")).then(
        ({ data }) => data === true,
        () => false,
      ),
    );
  }
  return cache.get(uid)!;
}

export function useIsAdmin() {
  const me = useMe();
  const uid = me.status === "in" ? me.user.id : null;
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!uid) return setAdmin(false);
    let alive = true;
    isAdmin(uid).then((a) => alive && setAdmin(a));
    return () => {
      alive = false;
    };
  }, [uid]);
  return admin;
}

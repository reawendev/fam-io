"use client";

import { useEffect, useState } from "react";
import { useMe } from "./auth";
import { sb } from "./supabase";

export type Team = {
  id: string;
  slug: string;
  name: string;
  tag: string;
  color: string;
  description: string | null;
  logo_path: string | null;
  owner: string;
  created_at: string;
};
/** Davet kodu hariç (o sadece kaptana RPC ile gelir) */
export const TEAM_COLUMNS = "id, slug, name, tag, color, description, logo_path, owner, created_at";

export type TeamRow = {
  team_id: string;
  slug: string;
  name: string;
  tag: string;
  color: string;
  logo_path: string | null;
  members: number;
  xp: number;
  dubs: number;
};

export const TEAM_COLORS = ["#ff7a1a", "#38bdf8", "#a3e635", "#f472b6", "#c084fc", "#facc15", "#2dd4bf", "#fb7185", "#ededee"];

/** Giriş yapmış kullanıcının ekibi (yoksa null) */
export function useMyTeam() {
  const me = useMe();
  const uid = me.status === "in" ? me.user.id : null;
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!uid) return setTeam(null);
    sb()
      .from("team_members")
      .select(`teams(${TEAM_COLUMNS})`)
      .eq("user_id", uid)
      .maybeSingle()
      .then(({ data }) => setTeam(((data as unknown as { teams: Team } | null)?.teams) ?? null));
  }, [uid, tick]);
  return { team, reload: () => setTick((t) => t + 1) };
}

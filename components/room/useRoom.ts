"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import type { Room, RoomPlayer, RoomRole, SceneFull } from "@/lib/types";

export function useRoom(code: string) {
  const [me, setMe] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [scene, setScene] = useState<SceneFull | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [assignments, setAssignments] = useState<RoomRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sceneIdRef = useRef<string | null>(null);

  const loadScene = useCallback(async (sceneId: string) => {
    if (sceneIdRef.current === sceneId) return;
    sceneIdRef.current = sceneId;
    const { data, error } = await sb()
      .from("scenes")
      .select("*, scene_roles(*), scene_lines(*)")
      .eq("id", sceneId)
      .single();
    if (error) throw error;
    setScene(data as SceneFull);
  }, []);

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data } = await sb().from("room_players").select("*").eq("room_id", roomId).order("joined_at");
    if (data) setPlayers(data as RoomPlayer[]);
  }, []);

  const loadAssignments = useCallback(async (roomId: string) => {
    const { data } = await sb().from("room_roles").select("*").eq("room_id", roomId);
    if (data) setAssignments(data as RoomRole[]);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const u = await ensureUser();
      setMe(u.id);
      const { data, error } = await sb().from("rooms").select("*").eq("code", code.toUpperCase()).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Oda bulunamadı. Kodu kontrol et.");
      const r = data as Room;
      setRoom(r);
      await Promise.all([loadScene(r.scene_id), loadPlayers(r.id), loadAssignments(r.id)]);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [code, loadScene, loadPlayers, loadAssignments]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime abonelikleri
  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const ch = sb()
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (p) => {
        if (p.eventType === "DELETE") return setError("Oda silindi.");
        const r = p.new as Room;
        setRoom(r);
        loadScene(r.scene_id).catch(() => {});
        loadAssignments(roomId);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => loadPlayers(roomId),
      )
      // DELETE olayları filtrelenemiyor; ayrılan oyuncular için de yenile
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_players" }, () => loadPlayers(roomId))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_roles", filter: `room_id=eq.${roomId}` },
        () => loadAssignments(roomId),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadAll();
      });

    // Telefon uykudan dönünce vs. yakala
    const onVis = () => document.visibilityState === "visible" && loadAll();
    document.addEventListener("visibilitychange", onVis);
    // Güvenlik ağı: realtime kaçırırsa diye ara ara yenile
    const iv = setInterval(() => loadAll(), 15000);

    return () => {
      sb().removeChannel(ch);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(iv);
    };
  }, [roomId, loadAll, loadAssignments, loadPlayers, loadScene]);

  return { me, room, scene, players, assignments, error, loading, reload: loadAll, setError };
}

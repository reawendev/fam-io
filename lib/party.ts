"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publicUrl, sb } from "./supabase";
import type { Equipped } from "./types";

/** Parti modları (kim / efekt / duygu) için party_state() yanıtı */
export type PartyClip = {
  id: string;
  label: number;
  audio: string;
  mine: boolean;
  owner?: string | null;
  secret?: string | null;
  votes?: number | null;
  guesses?: { voter: string; answer: string }[] | null;
};
export type PartyState = {
  kind: "kim" | "efekt" | "duygu";
  round: number;
  rounds: number;
  phase: "record" | "answer" | "reveal";
  prompt: string;
  options: string[];
  players: string[];
  scores: Record<string, number>;
  round_points: Record<string, number>;
  token: string | null;
  secret: string | null;
  my_audio: string | null;
  in_round: boolean;
  clips: PartyClip[] | null;
  my_answers: Record<string, string>;
};
export type StoryState = {
  kind: "hikaye";
  turn: number;
  turns: number;
  topic: string;
  order: string[];
  current: string | null;
  token: string | null;
  prev: string | null;
  parts: number;
  mine: number;
};

/** Arşivlenmiş oyun (party_games) */
export type PartyGameRow = {
  id: string;
  kind: "kim" | "efekt" | "duygu" | "hikaye";
  created_at: string;
  players: number;
  data: {
    topic?: string;
    parts?: { user: string; audio: string; turn: number }[];
    scores?: Record<string, number>;
    rounds?: {
      round: number;
      prompt: string;
      clips: { user: string; audio: string; secret: string | null; label: number; votes: number; guesses: { voter: string; answer: string; correct: boolean | null }[] }[];
    }[];
  };
  party_game_players: {
    user_id: string;
    points: number;
    winner: boolean;
    profile: { display_name: string; username: string; color: string; avatar_path: string | null; equipped: Equipped | null } | null;
  }[];
};
export const PARTY_GAME_SELECT =
  "id, kind, created_at, players, data, party_game_players(user_id, points, winner, profile:profiles(display_name, username, color, avatar_path, equipped))";

/** İsimsiz yükleme: p/<anahtar>/<zaman>.<uzantı> (yoldan kimin olduğu anlaşılmaz) */
export async function uploadPartyClip(token: string, blob: Blob, ext: string): Promise<string> {
  const path = `p/${token}/${Date.now()}.${ext}`;
  const { error } = await sb()
    .storage.from("recordings")
    .upload(path, blob, { contentType: blob.type || "audio/webm", cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

export const clipLetter = (n: number) => String.fromCharCode(64 + Math.max(1, Math.min(26, n)));

/** Aynı anda tek ses: play(key, path) / stop(); sıralı çalma için playSeq */
export function useOnePlayer() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const seq = useRef(0);
  const [now, setNow] = useState<string | null>(null);
  useEffect(
    () => () => {
      seq.current++;
      ref.current?.pause();
    },
    [],
  );
  const playOne = useCallback((key: string, path: string) => {
    return new Promise<void>((resolve) => {
      ref.current?.pause();
      const a = new Audio(publicUrl("recordings", path));
      ref.current = a;
      setNow(key);
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }, []);
  const play = useCallback(
    async (key: string, path: string) => {
      const my = ++seq.current;
      await playOne(key, path);
      if (seq.current === my) setNow(null);
    },
    [playOne],
  );
  const playSeq = useCallback(
    async (items: { key: string; path: string }[], onDone?: () => void) => {
      const my = ++seq.current;
      for (const it of items) {
        await playOne(it.key, it.path);
        if (seq.current !== my) return;
        await new Promise((r) => setTimeout(r, 350));
        if (seq.current !== my) return;
      }
      setNow(null);
      onDone?.();
    },
    [playOne],
  );
  const stop = useCallback(() => {
    seq.current++;
    ref.current?.pause();
    setNow(null);
  }, []);
  return { now, play, playSeq, stop };
}

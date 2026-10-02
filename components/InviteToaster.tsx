"use client";

import { Check, DoorOpen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MODE_ICON } from "@/components/room/ModePicker";
import { Avatar, Button, UserName } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { modeName } from "@/lib/modes";
import { playJingle } from "@/lib/shop";
import { errMsg, sb } from "@/lib/supabase";
import type { Equipped, GameMode } from "@/lib/types";

type Invite = {
  id: string;
  room_id: string;
  code: string;
  mode: GameMode;
  created_at: string;
  players: number;
  scene: string | null;
  from: { username: string; display_name: string; color: string; avatar_path: string | null; equipped?: Equipped };
};

/** Oda davetleri: sitenin her sayfasında anında çıkar; Katıl ya da Reddet */
export default function InviteToaster() {
  const me = useMe();
  const uid = me.status === "in" ? me.user.id : null;
  const router = useRouter();
  const pathname = usePathname();
  const [list, setList] = useState<Invite[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("my_invites");
    if (error) return; // 011 çalıştırılmamışsa sessiz kal
    const next = (data as Invite[]) ?? [];
    // Yeni davet geldiyse kısa bir zil
    if (seen.current && next.some((i) => !seen.current!.has(i.id + i.created_at))) {
      try {
        playJingle("sound_zil", 0.35);
      } catch {}
    }
    seen.current = new Set(next.map((i) => i.id + i.created_at));
    setList(next);
  }, []);

  useEffect(() => {
    if (!uid) {
      setList([]);
      seen.current = null;
      return;
    }
    load();
    const ch = sb()
      .channel(`invites:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_invites", filter: `to_user=eq.${uid}` }, () => load())
      .subscribe();
    const iv = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      sb().removeChannel(ch);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [uid, load]);

  // Sayfa değişince listeyi tazele (odaya girince o odanın daveti düşer)
  useEffect(() => {
    if (uid) load();
  }, [pathname, uid, load]);

  async function answer(inv: Invite, accept: boolean) {
    setBusy(inv.id + (accept ? "y" : "n"));
    setErr(null);
    const { data, error } = await sb().rpc("respond_invite", { p_id: inv.id, p_accept: accept });
    setBusy(null);
    if (error) {
      setErr({ id: inv.id, text: errMsg(error) });
      return;
    }
    setList((l) => l.filter((x) => x.id !== inv.id));
    if (accept && data) router.push(`/oda/${data}`);
  }

  const here = pathname.toLowerCase();
  const show = list.filter((i) => !hidden.has(i.id) && !here.startsWith(`/oda/${i.code.toLowerCase()}`)).slice(0, 3);

  return (
    <div className="pointer-events-none fixed top-16 right-4 z-[65] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {show.map((inv) => (
          <motion.div
            key={inv.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto overflow-hidden rounded-xl border border-line-strong bg-surface-2/95 shadow-2xl shadow-black/50 backdrop-blur"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className="relative mt-0.5">
                <Avatar name={inv.from.display_name} color={inv.from.color} path={inv.from.avatar_path} frame={inv.from.equipped?.frame} size={40} />
                <span className="absolute -right-1 -bottom-1 z-10 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg ring-2 ring-surface-2 [&_svg]:size-3">
                  {MODE_ICON[inv.mode] ?? <DoorOpen />}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <UserName name={inv.from.display_name} fx={inv.from.equipped?.name} className="font-medium" />{" "}
                  <span className="text-fg-2">seni odasına çağırıyor</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {modeName(inv.mode)}
                  {inv.scene ? ` · ${inv.scene}` : ""} · {inv.players} kişi · <span className="font-mono tracking-[0.12em]">{inv.code}</span>
                </p>
                {err?.id === inv.id && <p className="mt-1 text-xs text-red-300">{err.text}</p>}
                <div className="mt-2.5 flex gap-2">
                  <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} loading={busy === inv.id + "y"} disabled={!!busy} onClick={() => answer(inv, true)}>
                    Katıl
                  </Button>
                  <Button size="sm" variant="ghost" loading={busy === inv.id + "n"} disabled={!!busy} onClick={() => answer(inv, false)}>
                    Reddet
                  </Button>
                </div>
              </div>
              <button
                className="-mt-1 -mr-1 rounded-md p-1 text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                onClick={() => setHidden((h) => new Set(h).add(inv.id))}
                aria-label="Şimdilik gizle"
                title="Şimdilik gizle"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

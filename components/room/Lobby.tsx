"use client";

import { Crown, LogOut, Mic, MicOff, Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, cx, Notice, RoleTag, Swatch } from "@/components/ui";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import type { Room, RoomPlayer, RoomRole, Scene, SceneFull } from "@/lib/types";

export type RoomProps = {
  room: Room;
  scene: SceneFull;
  me: string;
  players: RoomPlayer[];
  assignments: RoomRole[];
  isHost: boolean;
  /** Oda verisini hemen yeniden yükle (realtime gecikirse ekran beklemesin) */
  reload?: () => Promise<void> | void;
};

export default function Lobby({ room, scene, me, players, assignments, isHost, reload }: RoomProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mic, setMic] = useState<"unknown" | "ok" | "denied">("unknown");
  const [sceneList, setSceneList] = useState<Scene[] | null>(null);

  const roles = useMemo(() => [...scene.scene_roles].sort((a, b) => a.sort - b.sort), [scene]);
  const ownerOf = (roleId: string) => assignments.find((a) => a.role_id === roleId)?.user_id;
  const nickOf = (uid?: string) => players.find((p) => p.user_id === uid)?.nickname ?? "?";
  const stats = (roleId: string) => {
    const ls = scene.scene_lines.filter((l) => l.role_id === roleId);
    return { n: ls.length, sec: ls.reduce((s, l) => s + (l.end_time - l.start_time), 0) };
  };
  const unclaimed = roles.filter((r) => !ownerOf(r.id)).length;
  const withRole = new Set(assignments.map((a) => a.user_id));
  const spectators = Math.max(0, players.length - roles.length);

  useEffect(() => {
    if (!isHost) return;
    sb()
      .from("scenes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setSceneList((data as Scene[]) ?? []));
  }, [isHost]);

  async function rpc(fn: string, args: Record<string, unknown>, key = fn) {
    setBusy(key);
    setError(null);
    const { error } = await sb().rpc(fn, args);
    if (error) setError(errMsg(error));
    else await reload?.();
    setBusy(null);
    return !error;
  }

  async function testMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMic("ok");
    } catch {
      setMic("denied");
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="panel overflow-hidden">
          <video
            key={scene.id}
            src={publicUrl("scenes", scene.video_path)}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
          />
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <h2 className="font-medium">{scene.title}</h2>
              {scene.description && <p className="mt-1 text-sm text-muted">{scene.description}</p>}
              <p className="mt-2 text-xs text-muted">Sahneyi sesiyle izleyip hangi karakteri istediğine karar verebilirsin.</p>
            </div>
            {isHost && sceneList && sceneList.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted">
                Sahne
                <select
                  className="field h-8 w-48 px-2 text-[13px]"
                  value={scene.id}
                  disabled={!!busy}
                  onChange={(e) => rpc("change_scene", { p_room: room.id, p_scene: e.target.value })}
                >
                  {sceneList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        {error && <Notice>{error}</Notice>}
        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Karakterini seç</h3>
            <span className="font-mono text-xs text-muted">
              {roles.length - unclaimed}/{roles.length}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {roles.map((r) => {
              const owner = ownerOf(r.id);
              const mine = owner === me;
              const st = stats(r.id);
              return (
                <li key={r.id} className={cx("flex items-center gap-3 px-4 py-3", mine && "bg-surface-2")}>
                  <Swatch color={r.color} className="size-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="font-mono text-[11px] text-muted">
                      {st.n} replik · {st.sec.toFixed(0)} sn
                    </p>
                  </div>
                  {!owner ? (
                    <Button size="sm" loading={busy === r.id} disabled={!!busy} onClick={() => rpc("claim_role", { p_room: room.id, p_role: r.id }, r.id)}>
                      Seç
                    </Button>
                  ) : mine ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-accent">Sen</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === r.id}
                        disabled={!!busy}
                        onClick={() => rpc("release_role", { p_room: room.id, p_role: r.id }, r.id)}
                      >
                        Bırak
                      </Button>
                    </div>
                  ) : (
                    <span className="flex items-center gap-2 text-[13px] text-fg-2">
                      <Avatar name={nickOf(owner)} size={20} />
                      <span className="max-w-24 truncate">{nickOf(owner)}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            Birden fazla karakter seçebilirsin. Seçilmeyenler başlarken rastgele dağıtılır.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Oyuncular</h3>
            <span className="font-mono text-xs text-muted">{players.length}</span>
          </div>
          <ul className="flex flex-col gap-1 p-2">
            {players.map((p) => {
              const my = assignments.filter((a) => a.user_id === p.user_id);
              return (
                <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <Avatar name={p.nickname} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="truncate">{p.nickname}</span>
                      {p.user_id === me && <span className="text-xs text-muted">(sen)</span>}
                      {p.user_id === room.host_id && <Crown className="size-3.5 text-accent" aria-label="Oda sahibi" />}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {my.map((a) => {
                      const role = roles.find((r) => r.id === a.role_id);
                      return role ? <RoleTag key={a.role_id} name={role.name} color={role.color} className="h-5 px-1.5 text-[11px]" /> : null;
                    })}
                    {!withRole.has(p.user_id) && <span className="text-xs text-muted">seçmedi</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="panel flex flex-col gap-3 p-4">
          <Button
            size="sm"
            variant={mic === "denied" ? "danger" : "secondary"}
            icon={mic === "denied" ? <MicOff className="size-3.5" /> : <Mic className={cx("size-3.5", mic === "ok" && "text-ok")} />}
            onClick={testMic}
          >
            {mic === "ok" ? "Mikrofon hazır" : mic === "denied" ? "Mikrofon izni yok" : "Mikrofonu test et"}
          </Button>
          {mic === "denied" && <p className="text-xs text-red-300">Tarayıcı ayarlarından bu siteye mikrofon izni ver.</p>}

          {isHost ? (
            <>
              <Button
                variant="primary"
                size="lg"
                loading={busy === "start_game"}
                disabled={!!busy || players.length === 0 || scene.scene_lines.length === 0}
                onClick={() => rpc("start_game", { p_room: room.id })}
              >
                Kayda başla
              </Button>
              {(unclaimed > 0 || spectators > 0) && (
                <p className="flex items-start gap-1.5 text-xs text-muted">
                  <Shuffle className="mt-px size-3.5 shrink-0" />
                  <span>
                    {unclaimed > 0 && `Seçilmeyen ${unclaimed} karakter rastgele dağıtılacak. `}
                    {spectators > 0 && `${spectators} kişi bu turda karakter almayabilir.`}
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="py-1 text-center text-sm text-muted">Oda sahibinin kaydı başlatması bekleniyor</p>
          )}
          <p className="text-xs text-muted">Kulaklık kullanmak kayıt kalitesini artırır.</p>
          <button
            className="flex items-center gap-1.5 self-start text-xs text-muted transition-colors hover:text-red-300"
            disabled={!!busy}
            onClick={async () => {
              if (await rpc("leave_room", { p_room: room.id })) router.push("/");
            }}
          >
            <LogOut className="size-3.5" /> Odadan ayrıl
          </button>
        </div>
      </aside>
    </main>
  );
}

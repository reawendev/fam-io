"use client";

import { Bell, BellOff, Crown, Dices, Link2, Lock, LockOpen, LogOut, Mic, MicOff, Shuffle, Swords, UserX, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, cx, IconButton, Notice, RoleTag, Swatch, UserName } from "@/components/ui";
import ModePicker from "./ModePicker";
import { playEntrance } from "@/lib/shop";
import { MODES, needsScene } from "@/lib/modes";
import { MODE_ICON } from "./ModePicker";
import Soundboard from "@/components/Soundboard";
import type { GameMod, GameMode } from "@/lib/types";
import MicWave from "@/components/MicWave";
import { CreatorTag } from "@/components/SceneBits";
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

/** Lobi sahnesiz de açılabilir (Kulaktan kulağa) */
export type LobbyProps = Omit<RoomProps, "scene"> & { scene: SceneFull | null };

export default function Lobby({ room, scene, me, players, assignments, isHost, reload }: LobbyProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mic, setMic] = useState<"unknown" | "ok" | "denied">("unknown");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [heard, setHeard] = useState(false);
  const [sceneList, setSceneList] = useState<Scene[] | null>(null);

  const roles = useMemo(() => [...(scene?.scene_roles ?? [])].sort((a, b) => a.sort - b.sort), [scene]);
  const lineCount = scene?.scene_lines.length ?? 0;
  const ownerOf = (roleId: string) => assignments.find((a) => a.role_id === roleId)?.user_id;
  const nickOf = (uid?: string) => players.find((p) => p.user_id === uid)?.nickname ?? "?";
  const playerOf = (uid?: string) => players.find((p) => p.user_id === uid);
  const stats = (roleId: string) => {
    const ls = (scene?.scene_lines ?? []).filter((l) => l.role_id === roleId);
    return { n: ls.length, sec: ls.reduce((s, l) => s + (l.end_time - l.start_time), 0) };
  };
  const unclaimed = roles.filter((r) => !ownerOf(r.id)).length;
  const withRole = new Set(assignments.map((a) => a.user_id));
  const spectators = Math.max(0, players.length - roles.length - (room.foley_user ? 1 : 0));
  const mode: GameMode = room.mode ?? "klasik";
  const mods: GameMod[] = room.mods ?? [];
  const rolesMode = mode === "klasik" || mode === "senarist";
  const sceneless = !needsScene(mode);
  const minPlayers = MODES.find((m) => m.id === mode)?.min ?? 1;
  // Başlarken karakter alacak kişi sayısı (tahmini): foley yapan hariç, karakter sayısı kadar
  const actors = Math.min(players.length - (room.foley_user && players.length > 1 ? 1 : 0), roles.length);

  // Odaya biri katılınca imza sesi / giriş sesi çal (sessize alınabilir)
  const [sounds, setSounds] = useState(true);
  useEffect(() => {
    try {
      setSounds(localStorage.getItem("famio.joinSounds") !== "0");
    } catch {}
  }, []);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(players.map((p) => p.user_id));
    if (seen.current && sounds) {
      const fresh = players.filter((p) => !seen.current!.has(p.user_id) && p.user_id !== me);
      fresh.slice(0, 2).forEach((p, i) => setTimeout(() => playEntrance(p, (path) => publicUrl("avatars", path)), i * 1200));
    }
    seen.current = ids;
  }, [players, me, sounds]);

  useEffect(() => {
    if (!isHost) return;
    sb()
      .from("scenes")
      .select("*, scene_roles!inner(id)")
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

  // Mikrofon testi: 8 saniye canlı ses dalgası gösterir
  async function testMic() {
    if (micStream) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      setMic("ok");
      setHeard(false);
      setMicStream(s);
      setTimeout(() => {
        s.getTracks().forEach((t) => t.stop());
        setMicStream(null);
      }, 8000);
    } catch {
      setMic("denied");
    }
  }
  useEffect(() => () => micStream?.getTracks().forEach((t) => t.stop()), [micStream]);

  async function kick(uid: string) {
    if (!confirm(`${nickOf(uid)} odadan çıkarılsın mı? Bu odaya tekrar katılamaz.`)) return;
    await rpc("kick_player", { p_room: room.id, p_user: uid }, "kick:" + uid);
  }
  async function makeHost(uid: string) {
    if (!confirm(`Oda sahipliği ${nickOf(uid)} kişisine geçsin mi?`)) return;
    await rpc("transfer_host", { p_room: room.id, p_user: uid }, "host:" + uid);
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-w-0 flex-col gap-4 lg:row-span-2">
        {sceneless ? (
          <SceneFreeIntro mode={mode} players={players.length} />
        ) : scene ? (
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
              <CreatorTag creator={scene.creator} size="md" className="mt-2" />
              <p className="mt-2 text-xs text-muted">Sahneyi sesiyle izleyip hangi karakteri istediğine karar verebilirsin.</p>
            </div>
            {isHost && sceneList && sceneList.length > 1 && (
              <div className="flex items-center gap-1.5">
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
              <IconButton
                label="Rastgele sahne"
                className="size-8"
                disabled={!!busy}
                onClick={() => {
                  const pool = sceneList.filter((s) => s.id !== scene.id);
                  const pick = pool[Math.floor(Math.random() * pool.length)];
                  if (pick) rpc("change_scene", { p_room: room.id, p_scene: pick.id }, "dice");
                }}
              >
                <Dices className="size-4" />
              </IconButton>
              </div>
            )}
          </div>
        </div>
        ) : null}
        <ModePicker
          room={room}
          isHost={isHost}
          busy={!!busy}
          players={players.length}
          onChange={(m, ms) => rpc("set_room_mode", { p_room: room.id, p_mode: m, p_mods: ms }, "mode")}
        />
      </section>

      <aside className="flex flex-col gap-4">
        {error && <Notice>{error}</Notice>}
        {!rolesMode ? (
          <div className="panel flex items-start gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              {sceneless ? MODE_ICON[mode] : mode === "zincir" ? <Link2 className="size-4" /> : <Swords className="size-4" />}
            </span>
            <div className="text-sm">
              <p className="font-medium">{sceneless ? SCENELESS_INFO[mode]?.title(players.length) : mode === "zincir" ? "Herkes tüm sahneyi seslendirir" : "Karakter seçimi yok"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {sceneless
                  ? SCENELESS_INFO[mode]?.note
                  : mode === "zincir"
                  ? `Başlarken sıra rastgele belirlenir. Sahnede ${roles.length} karakter, ${lineCount} replik var; kısa sahneler bu modda daha eğlenceli.`
                  : "Başlarken oyuncular rastgele eşleşir. Her maçta ikiniz aynı repliği seslendirirsiniz, diğerleri oylar. Tek kalan bir tur bay geçer."}
              </p>
            </div>
          </div>
        ) : (
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
                      <Avatar name={nickOf(owner)} color={playerOf(owner)?.color} path={playerOf(owner)?.avatar_path} size={20} />
                      <span className="max-w-24 truncate">{nickOf(owner)}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {mods.includes("foley") && (
            <div className={cx("flex items-center gap-3 border-t border-line px-4 py-3", room.foley_user === me && "bg-surface-2")}>
              <Volume2 className="size-3.5 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Foley ustası</p>
                <p className="text-[11px] text-muted">Konuşma yok; tüm sahnenin efekt seslerini yapar</p>
              </div>
              {!room.foley_user ? (
                <Button size="sm" loading={busy === "foley"} disabled={!!busy} onClick={() => rpc("claim_foley", { p_room: room.id, p_take: true }, "foley")}>
                  Seç
                </Button>
              ) : room.foley_user === me ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-accent">Sen</span>
                  <Button size="sm" variant="ghost" loading={busy === "foley"} disabled={!!busy} onClick={() => rpc("claim_foley", { p_room: room.id, p_take: false }, "foley")}>
                    Bırak
                  </Button>
                </div>
              ) : (
                <span className="max-w-24 truncate text-[13px] text-fg-2">{nickOf(room.foley_user)}</span>
              )}
            </div>
          )}
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            Birden fazla karakter seçebilirsin. Seçilmeyenler başlarken rastgele dağıtılır.
            {mods.includes("hain") && " Hain, karakteri olan oyunculardan gizlice seçilir (en az 3 kişi)."}
          </p>
        </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">
              Oyuncular <span className="ml-1 font-mono text-xs font-normal text-muted">{players.length}</span>
            </h3>
            {isHost ? (
              <button
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
                  room.locked ? "bg-amber-400/10 text-amber-200" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
                disabled={!!busy}
                onClick={() => rpc("set_room_lock", { p_room: room.id, p_locked: !room.locked }, "lock")}
                title={room.locked ? "Kilidi aç: kodu bilen herkes katılabilir" : "Kilitle: yeni kimse katılamaz"}
              >
                {room.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                {room.locked ? "Kilitli" : "Açık"}
              </button>
            ) : (
              room.locked && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                  <Lock className="size-3.5" /> Kilitli
                </span>
              )
            )}
          </div>
          <ul className="flex flex-col gap-1 p-2">
            {players.map((p) => {
              const my = assignments.filter((a) => a.user_id === p.user_id);
              return (
                <li key={p.user_id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                  <Avatar name={p.nickname} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm">
                      <UserName name={p.nickname} fx={p.equipped?.name} className="truncate" />
                      {p.user_id === me && <span className="text-xs text-muted">(sen)</span>}
                      {p.user_id === room.host_id && <Crown className="size-3.5 text-accent" aria-label="Oda sahibi" />}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {room.foley_user === p.user_id && <span className="text-[11px] text-fg-2">foley</span>}
                    {rolesMode && my.map((a) => {
                      const role = roles.find((r) => r.id === a.role_id);
                      return role ? <RoleTag key={a.role_id} name={role.name} color={role.color} className="h-5 px-1.5 text-[11px]" /> : null;
                    })}
                    {rolesMode && !withRole.has(p.user_id) && room.foley_user !== p.user_id && <span className="text-xs text-muted">seçmedi</span>}
                  </span>
                  {isHost && p.user_id !== me && (
                    <span className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <IconButton label="Oda sahibi yap" className="size-7" disabled={!!busy} onClick={() => makeHost(p.user_id)}>
                        <Crown className="size-3.5" />
                      </IconButton>
                      <IconButton label="Odadan çıkar" className="size-7 hover:text-red-300" disabled={!!busy} onClick={() => kick(p.user_id)}>
                        <UserX className="size-3.5" />
                      </IconButton>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <Soundboard roomId={room.id} me={me} players={players} />

        <div className="panel flex flex-col gap-3 p-4">
          <Button
            size="sm"
            variant={mic === "denied" ? "danger" : "secondary"}
            icon={mic === "denied" ? <MicOff className="size-3.5" /> : <Mic className={cx("size-3.5", mic === "ok" && "text-ok")} />}
            onClick={testMic}
          >
            {micStream ? "Bir şey söyle…" : mic === "ok" ? "Mikrofon hazır · tekrar test et" : mic === "denied" ? "Mikrofon izni yok" : "Mikrofonu test et"}
          </Button>
          {micStream && (
            <div className="rounded-lg border border-line bg-bg px-3 py-2">
              <MicWave stream={micStream} color={heard ? "#4ade80" : "#7d7d86"} onLevel={(pk) => pk > 0.06 && !heard && setHeard(true)} />
              <p className={cx("mt-1 text-center text-[11px]", heard ? "text-ok" : "text-muted")}>{heard ? "Sesin geliyor" : "Ses bekleniyor"}</p>
            </div>
          )}
          {mic === "denied" && <p className="text-xs text-red-300">Tarayıcı ayarlarından bu siteye mikrofon izni ver.</p>}

          {isHost ? (
            <>
              <Button
                variant="primary"
                size="lg"
                loading={busy === "start_game"}
                disabled={!!busy || players.length < minPlayers || (!sceneless && lineCount === 0)}
                onClick={() => rpc("start_game", { p_room: room.id })}
              >
                {sceneless ? "Oyunu başlat" : mode === "duello" ? "Turnuvayı başlat" : mode === "zincir" ? "Zinciri başlat" : mode === "senarist" ? "Yazıma başla" : "Kayda başla"}
              </Button>
              {players.length < minPlayers && <p className="text-xs text-amber-200">Bu mod için en az {minPlayers} oyuncu gerekir.</p>}
              {mods.includes("hain") && actors < 3 && rolesMode && (
                <p className="text-xs text-amber-200">Hain için karakteri olan en az 3 oyuncu gerekir; yoksa bu tur hainsiz oynanır.</p>
              )}
              {rolesMode && (unclaimed > 0 || spectators > 0) && (
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
            className="flex items-center gap-1.5 self-start text-xs text-muted transition-colors hover:text-fg"
            onClick={() => {
              const v = !sounds;
              setSounds(v);
              try {
                localStorage.setItem("famio.joinSounds", v ? "1" : "0");
              } catch {}
            }}
            aria-pressed={sounds}
          >
            {sounds ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />} Giriş sesleri {sounds ? "açık" : "kapalı"}
          </button>
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

const SCENELESS_INFO: Record<string, { title: (n: number) => string; note: string; lead: string; steps: { t: string; d: string }[] }> = {
  kulak: {
    title: (n) => `${n} cümle, ${n} tur`,
    note: "Başlarken sıra rastgele belirlenir. Her turda herkes aynı anda oynar; bir tur, herkes kaydını gönderince biter. Oyun sırasında odaya kimse katılamaz.",
    lead: "Sahne yok. Bir cümle ağızdan ağıza dolaşır, sonunda bambaşka bir şeye dönüşür.",
    steps: [
      { t: "Oku", d: "Herkese gizli, komik bir cümle düşer (istersen kendin yazarsın). Sesli okursun." },
      { t: "Dinle ve tekrarla", d: "Sonraki turda başkasının kaydını duyarsın; metni görmeden, duyduğun gibi tekrarlarsın." },
      { t: "Tahmin et", d: "Son kişi duyduğunu yazar. Finalde baştaki cümleyle karşılaştırılır." },
    ],
  },
  kim: {
    title: () => "3 tur, herkes aynı anda",
    note: "Kayıtlar isimsiz yüklenir; dosyalardan bile kimin olduğu anlaşılmaz. Doğru tahmin +1, seni tanıyamayan her kişi için +1 puan.",
    lead: "Herkes aynı cümleyi okur ama kimse kendi sesiyle konuşmaz.",
    steps: [
      { t: "Sesini değiştir", d: "Ekrandaki cümleyi kalın, ince, aksanlı… tanınmayacak bir sesle oku." },
      { t: "Kimin sesi?", d: "Kayıtlar karışık çalınır. Her birinin kime ait olduğunu tahmin et." },
      { t: "Açıklama", d: "Kim kimi kandırdı? Puanlar eklenir, 3 turun sonunda birinci +15 XP alır." },
    ],
  },
  efekt: {
    title: () => "3 efekt, 3 oylama",
    note: "Her turda yeni bir efekt. Kayıtlar isimsiz oylanır; aldığın her oy +1 puan. Kendine oy veremezsin.",
    lead: "Foley stüdyosu sizsiniz: ağzınızla, eşyalarla, ne bulursanız.",
    steps: [
      { t: "Efekti yap", d: "Ekranda bir efekt çıkar: kapı gıcırtısı, dinozor kükremesi… En fazla 6 saniye." },
      { t: "Oyla", d: "Herkesin kaydı isimsiz çalınır. En iyisine oy ver." },
      { t: "Kazanan", d: "Kimin hangi sesi yaptığı açıklanır. 3 turun sonunda birinci +15 XP alır." },
    ],
  },
  duygu: {
    title: () => "3 tur, gizli duygular",
    note: "Herkesin duygusu farklıdır ve sadece kendisi görür. Doğru tahmin edilen kayıtta hem tahmin eden hem okuyan +1 puan.",
    lead: "Aynı cümle, bambaşka duygular.",
    steps: [
      { t: "Duygunu çek", d: "Sana gizli bir duygu düşer: aşık, şüpheli, uykulu… Cümleyi o duyguyla oku." },
      { t: "Tahmin et", d: "Diğerlerinin kayıtlarını dinle, hangi duyguyla okuduklarını seç." },
      { t: "Açıklama", d: "Duygular açılır. İyi oynayan da iyi tahmin eden de kazanır." },
    ],
  },
  hikaye: {
    title: (n) => `${n} kişi, sırayla`,
    note: "Sıra rastgele belirlenir; herkes en az bir kez anlatır. Sırası gelmeyenler bekler, final herkesle birlikte dinlenir.",
    lead: "Bir açılış cümlesi, sonra her şey sizin elinizde.",
    steps: [
      { t: "Açılış", d: "İlk kişi ekrandaki açılış cümlesinden devam eder ve bir cümle kaydeder." },
      { t: "Sadece öncekini duy", d: "Sıradaki kişi yalnızca bir önceki parçayı dinler ve hikâyeye bir cümle ekler." },
      { t: "Baştan sona", d: "Finalde bütün hikâye arka arkaya çalınır; paylaşılabilir." },
    ],
  },
};

/** Sahnesiz modların lobisi: sahne yerine nasıl oynandığı */
function SceneFreeIntro({ mode, players }: { mode: GameMode; players: number }) {
  const info = SCENELESS_INFO[mode] ?? SCENELESS_INFO.kulak;
  const name = MODES.find((m) => m.id === mode)?.name ?? "";
  return (
    <div className="panel overflow-hidden">
      <div className="relative flex aspect-[21/9] items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(255,122,26,0.16),transparent_70%)]">
        <div className="flex items-center gap-2 sm:gap-3" aria-hidden>
          {Array.from({ length: Math.max(3, Math.min(players, 6)) }, (_, i) => (
            <span key={i} className="flex items-center gap-2 sm:gap-3">
              {i > 0 && <span className="h-px w-5 bg-gradient-to-r from-accent/60 to-accent/10 sm:w-8" />}
              <span
                className="flex size-10 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent sm:size-12 [&_svg]:size-5"
                style={{ opacity: 1 - i * 0.12 }}
              >
                {MODE_ICON[mode]}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="p-4">
        <h2 className="font-medium">{name}</h2>
        <p className="mt-1 text-sm text-muted">{info.lead}</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {info.steps.map((s, i) => (
            <li key={s.t} className="rounded-lg border border-line bg-bg p-3">
              <span className="font-mono text-[11px] text-accent">{i + 1}</span>
              <p className="mt-1 text-sm font-medium">{s.t}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

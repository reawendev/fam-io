"use client";

import { Check, Dices, Ear, Headphones, Hourglass, PenLine, Send, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { Avatar, Button, cx, Notice, Spinner } from "@/components/ui";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import type { LobbyProps } from "./Lobby";

type Task = {
  round: number;
  rounds: number;
  kind: "start" | "repeat" | "guess" | "skip" | "watch";
  prompt: string | null;
  audio: string | null;
  done: boolean;
  my_audio: string | null;
  my_text: string | null;
};

const MAX_SEC = 12;
const LISTENS = 2;

/** Kulaktan kulağa: tur ekranı (oku → dinle/tekrarla → yaz) */
export default function PhoneGame({ room, me, players, isHost, reload }: Omit<LobbyProps, "scene" | "assignments">) {
  const round = room.mode_state?.round ?? 0;
  const order = room.mode_state?.order ?? [];
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blob, setBlob] = useState<{ b: Blob; ext: string } | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("phone_task", { p_room: room.id });
    if (error) return setError(errMsg(error));
    setTask(data as Task);
  }, [room.id]);

  // Tur değişince sıfırla
  useEffect(() => {
    setBlob(null);
    setCustom(null);
    setGuess("");
    setEditing(false);
    setError(null);
    load();
  }, [load, round]);

  // Dinleme hakkı (sayfa yenilense de korunur)
  const lkey = `famio.kulak.${room.id}.${round}`;
  const [listens, setListens] = useState(0);
  useEffect(() => {
    try {
      setListens(Number(localStorage.getItem(lkey) ?? 0));
    } catch {
      setListens(0);
    }
  }, [lkey]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [hearing, setHearing] = useState(false);
  useEffect(() => () => audioRef.current?.pause(), []);

  function listen() {
    if (!task?.audio || hearing || listens >= LISTENS) return;
    const a = new Audio(publicUrl("recordings", task.audio));
    audioRef.current = a;
    const n = listens + 1;
    setListens(n);
    try {
      localStorage.setItem(lkey, String(n));
    } catch {}
    a.onended = () => setHearing(false);
    a.onerror = () => {
      setHearing(false);
      setError("Kayıt çalınamadı. Sayfayı yenileyip tekrar dene.");
    };
    setHearing(true);
    a.play().catch(() => setHearing(false));
  }

  async function reroll() {
    setBusy("reroll");
    const { data, error } = await sb().rpc("phone_reroll", { p_room: room.id });
    setBusy(null);
    if (error) return setError(errMsg(error));
    setTask((t) => (t ? { ...t, prompt: data as string } : t));
    setCustom(null);
  }

  async function submit() {
    if (!task) return;
    setBusy("send");
    setError(null);
    try {
      let path: string | null = null;
      if (task.kind !== "guess") {
        if (!blob) throw new Error("Önce kaydını yap.");
        path = `${room.id}/${me}/kulak-${round}-${Date.now()}.${blob.ext}`;
        const { error: e1 } = await sb()
          .storage.from("recordings")
          .upload(path, blob.b, { contentType: blob.b.type || "audio/webm", cacheControl: "31536000" });
        if (e1) throw e1;
      }
      const text = task.kind === "guess" ? guess : task.kind === "start" ? (custom?.trim() || task.prompt) : null;
      const { error } = await sb().rpc("phone_submit", { p_room: room.id, p_path: path, p_text: text });
      if (error) {
        if (path) sb().storage.from("recordings").remove([path]).catch(() => {});
        throw error;
      }
      if (path && task.my_audio && task.my_audio !== path) sb().storage.from("recordings").remove([task.my_audio]).catch(() => {});
      setEditing(false);
      setBlob(null);
      await load();
      reload?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function skipWaiting() {
    if (!confirm("Henüz göndermeyenlerin bu turdaki adımı atlansın mı?")) return;
    setBusy("skip");
    const { error } = await sb().rpc("phone_skip", { p_room: room.id });
    setBusy(null);
    if (error) setError(errMsg(error));
    else reload?.();
  }

  const inOrder = players.filter((p) => order.includes(p.user_id));
  const doneCount = inOrder.filter((p) => p.done).length;
  const rounds = task?.rounds ?? order.length;
  const stepName = (r: number) => (r === 0 ? "Oku" : r === rounds - 1 ? "Yaz" : "Tekrarla");
  const showForm = task && !["skip", "watch"].includes(task.kind) && (!task.done || editing);

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-4">
        <ol className="flex gap-1.5" aria-label="Turlar">
          {Array.from({ length: rounds }, (_, i) => (
            <li key={i} className="flex flex-1 flex-col gap-1.5">
              <span className={cx("h-1.5 rounded-full", i < round ? "bg-accent" : i === round ? "bg-accent/60" : "bg-surface-3")} />
              <span className={cx("text-[11px]", i === round ? "font-medium text-fg" : "text-muted")}>
                {i + 1}. {stepName(i)}
              </span>
            </li>
          ))}
        </ol>

        {error && <Notice>{error}</Notice>}

        {!task ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Hazırlanıyor
          </div>
        ) : task.kind === "watch" ? (
          <Info icon={<Ear className="size-5" />} title="Bu oyunda sıran yok">
            Oyun sen katılmadan başladı. Final başlayınca sonuçları burada izleyebilirsin.
          </Info>
        ) : task.kind === "skip" ? (
          <Info icon={<Hourglass className="size-5" />} title="Bu tur sana bir şey düşmedi">
            Sana gelen zincirdeki herkes atlandığı için duyacak bir ses yok. Diğerleri bitirince final başlar.
          </Info>
        ) : !showForm ? (
          <Info icon={<Check className="size-5" />} title="Gönderildi" tone="ok">
            Herkes gönderince {round + 1 >= rounds ? "final başlar" : "sonraki tur başlar"}.
            {task.my_text && <span className="mt-2 block text-fg-2">Tahminin: “{task.my_text}”</span>}
            <span className="mt-3 block">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                {task.kind === "guess" ? "Tahmini değiştir" : "Yeniden kaydet"}
              </Button>
            </span>
          </Info>
        ) : (
          <div className="panel overflow-hidden">
            {task.kind === "start" ? (
              <div className="border-b border-line p-5">
                <p className="eyebrow">Senin cümlen · kimse görmüyor</p>
                {custom === null ? (
                  <p className="mt-3 text-xl leading-snug font-medium tracking-tight sm:text-2xl">“{task.prompt}”</p>
                ) : (
                  <textarea
                    autoFocus
                    className="field mt-3 h-20 resize-none py-2 text-base"
                    maxLength={120}
                    placeholder="Kendi cümleni yaz (en fazla 120 karakter)"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" icon={<Dices className="size-3.5" />} loading={busy === "reroll"} disabled={!!busy} onClick={reroll}>
                    Başka cümle
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<PenLine className="size-3.5" />}
                    onClick={() => setCustom(custom === null ? "" : null)}
                  >
                    {custom === null ? "Kendim yazayım" : "Hazır cümleye dön"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-b border-line p-5">
                <p className="eyebrow">{task.kind === "guess" ? "Son kulak sensin" : "Kulağına fısıldandı"}</p>
                <p className="mt-2 text-sm text-fg-2">
                  {task.kind === "guess"
                    ? "Önceki kişinin kaydını dinle ve ne duyduğunu yaz. Finalde baştaki cümleyle karşılaştırılacak."
                    : "Metni göremezsin. Önceki kişinin kaydını dinle, duyduğun gibi tekrarla. Anlamsız geldiyse de öyle söyle!"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant={listens === 0 ? "primary" : "secondary"}
                    icon={hearing ? <Spinner className="text-current" /> : <Headphones className="size-4" />}
                    disabled={hearing || listens >= LISTENS}
                    onClick={listen}
                  >
                    {hearing ? "Dinleniyor…" : listens === 0 ? "Dinle" : "Bir daha dinle"}
                  </Button>
                  <span className="text-xs text-muted">
                    {LISTENS - listens > 0 ? `${LISTENS - listens} dinleme hakkın kaldı` : "Dinleme hakkın bitti"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 p-5">
              {task.kind === "guess" ? (
                <>
                  <label className="text-sm font-medium" htmlFor="kulak-guess">
                    Ne duydun?
                  </label>
                  <textarea
                    id="kulak-guess"
                    className="field h-20 resize-none py-2 text-base"
                    maxLength={120}
                    placeholder={listens === 0 ? "Önce dinle" : "Duyduğunu yaz"}
                    disabled={listens === 0 && !editing}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{task.kind === "start" ? "Cümleyi sesli oku" : "Duyduğunu tekrarla"}</p>
                  <VoiceRecorder
                    key={`${round}-${editing}`}
                    value={null}
                    max={MAX_SEC}
                    size="md"
                    label={`Kaydet (${MAX_SEC} sn)`}
                    disabled={task.kind === "repeat" && listens === 0 && !editing}
                    onChange={(b, ext) => setBlob({ b, ext })}
                  />
                  {task.kind === "repeat" && listens === 0 && !editing && <p className="text-xs text-muted">Kayda geçmeden önce dinle.</p>}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={<Send className="size-4" />}
                  loading={busy === "send"}
                  disabled={!!busy || (task.kind === "guess" ? guess.trim().length === 0 : !blob) || (task.kind === "start" && custom !== null && !custom.trim())}
                  onClick={submit}
                >
                  {task.kind === "guess" ? "Tahmini gönder" : "Gönder"}
                </Button>
                {editing && (
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Vazgeç
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Bu tur</h3>
            <span className="font-mono text-xs text-muted">
              {doneCount}/{inOrder.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1 p-2">
            {inOrder.map((p) => (
              <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar name={p.nickname} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.nickname}
                  {p.user_id === me && <span className="ml-1 text-xs text-muted">(sen)</span>}
                </span>
                {p.done ? (
                  <Check className="size-4 text-ok" aria-label="Gönderdi" />
                ) : (
                  <span className="text-[11px] text-muted">bekleniyor</span>
                )}
              </li>
            ))}
          </ul>
          {isHost && doneCount < inOrder.length && (
            <div className="border-t border-line p-3">
              <Button size="sm" variant="ghost" className="w-full" icon={<SkipForward className="size-3.5" />} loading={busy === "skip"} disabled={!!busy} onClick={skipWaiting}>
                Bekleyenleri atla
              </Button>
              <p className="mt-1.5 px-1 text-[11px] text-muted">Biri takıldıysa: o kişinin bu turdaki adımı boş geçer, sonraki kişi bir önceki kaydı duyar.</p>
            </div>
          )}
        </div>
        <div className="panel p-4 text-xs leading-relaxed text-muted">
          Her turda herkes farklı bir zincirde oynar; kimse beklemez. Kulaklık takarsan kayıtlar birbirine karışmaz.
        </div>
      </aside>
    </main>
  );
}

function Info({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "ok" }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className={cx("flex size-11 items-center justify-center rounded-full", tone === "ok" ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted")}>{icon}</span>
      <p className="font-medium">{title}</p>
      <div className="max-w-sm text-sm text-muted">{children}</div>
    </div>
  );
}

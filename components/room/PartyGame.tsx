"use client";

import { ArrowRight, Check, Crown, Pause, Play, Send, SkipForward, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { Avatar, Button, cx, Notice, Spinner } from "@/components/ui";
import { emotion, MODES, PARTY_MAX_SEC } from "@/lib/modes";
import { clipLetter, uploadPartyClip, useOnePlayer, type PartyClip, type PartyState } from "@/lib/party";
import { errMsg, sb } from "@/lib/supabase";
import type { RoomPlayer } from "@/lib/types";
import type { LobbyProps } from "./Lobby";

type Person = { name: string; color?: string; avatar_path?: string | null; frame?: string };

const PHASES = [
  { id: "record", label: "Kayıt" },
  { id: "answer", label: "Tahmin" },
  { id: "reveal", label: "Açıklama" },
] as const;

/** Kim konuştu? / Efekt yarışması / Duygu ruleti: kayıt → tahmin (oy) → açıklama, 3 tur */
export default function PartyGame({ room, me, players, isHost, reload }: Omit<LobbyProps, "scene" | "assignments">) {
  const ms = room.mode_state ?? {};
  const [st, setSt] = useState<PartyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blob, setBlob] = useState<{ b: Blob; ext: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const player = useOnePlayer();

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("party_state", { p_room: room.id });
    if (error) return setError(errMsg(error));
    const s = data as PartyState;
    setSt(s);
    setAnswers(s.my_answers ?? {});
  }, [room.id]);

  // Tur/aşama değişince yenile
  useEffect(() => {
    setBlob(null);
    setEditing(false);
    setError(null);
    player.stop();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ms.round, ms.phase]);

  const people = useMemo(() => {
    const m: Record<string, Person> = {};
    for (const p of players) m[p.user_id] = { name: p.nickname, color: p.color, avatar_path: p.avatar_path, frame: p.equipped?.frame };
    return m;
  }, [players]);
  const person = (uid?: string | null) => (uid ? people[uid] : undefined) ?? { name: "Ayrılan oyuncu" };

  const kind = (room.mode ?? "kim") as PartyState["kind"];
  const modeName = MODES.find((m) => m.id === kind)?.name ?? "";
  const inGame = players.filter((p) => (ms.players ?? []).includes(p.user_id));
  const doneCount = inGame.filter((p) => p.done).length;

  async function sendClip() {
    if (!st?.token || !blob) return;
    setBusy("clip");
    setError(null);
    try {
      const path = await uploadPartyClip(st.token, blob.b, blob.ext);
      const { error } = await sb().rpc("party_submit_clip", { p_room: room.id, p_path: path });
      if (error) throw error;
      setBlob(null);
      setEditing(false);
      await load();
      reload?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendAnswers() {
    setBusy("answer");
    setError(null);
    const { error } = await sb().rpc("party_answer", { p_room: room.id, p_answers: answers });
    setBusy(null);
    if (error) return setError(errMsg(error));
    setEditing(false);
    await load();
    reload?.();
  }

  async function hostAction(fn: "party_next" | "party_skip") {
    if (fn === "party_skip" && !confirm("Henüz göndermeyenler beklenmeden devam edilsin mi?")) return;
    setBusy(fn);
    setError(null);
    const { error } = await sb().rpc(fn, { p_room: room.id });
    setBusy(null);
    if (error) setError(errMsg(error));
    else reload?.();
  }

  const others = (st?.clips ?? []).filter((c) => !c.mine);
  const myAnswered = st && Object.keys(st.my_answers ?? {}).length > 0;
  const complete = kind === "efekt" ? !!answers.vote : others.length > 0 && others.every((c) => answers[c.id]);
  const lastRound = st ? st.round >= st.rounds : false;

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-4">
        {/* Tur ve aşama */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="eyebrow mr-2">{modeName}</span>
            <span className="font-medium">
              Tur {st?.round ?? ms.round ?? 1}/{st?.rounds ?? ms.rounds ?? 3}
            </span>
          </p>
          <ol className="flex items-center gap-1 text-xs">
            {PHASES.map((p, i) => {
              const idx = PHASES.findIndex((x) => x.id === (st?.phase ?? ms.phase));
              return (
                <li key={p.id} className="flex items-center gap-1">
                  {i > 0 && <span className={cx("h-px w-3", i <= idx ? "bg-fg-2" : "bg-line-strong")} />}
                  <span className={cx("rounded-md px-2 py-1 font-medium", i === idx ? "bg-surface-3 text-fg" : i < idx ? "text-fg-2" : "text-muted")}>{p.label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Görev kartı */}
        {st && (
          <div className="panel relative overflow-hidden p-5">
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_160px_at_0%_0%,rgba(255,122,26,0.12),transparent)]" />
            <p className="eyebrow relative">{kind === "efekt" ? "Efekt" : "Cümle"}</p>
            <p className="relative mt-2 text-xl leading-snug font-medium tracking-tight sm:text-2xl">
              {kind === "efekt" ? st.prompt : `“${st.prompt}”`}
            </p>
            <p className="relative mt-2 text-sm text-muted">
              {kind === "kim"
                ? "Sesini değiştirerek oku: kalın, ince, aksanlı… Kimse seni tanımasın."
                : kind === "efekt"
                  ? "Ağzınla, ellerinle, eşyalarla bu sesi yap. En fazla 6 saniye."
                  : "Bu cümleyi sana düşen duyguyla oku. Abartmak serbest."}
            </p>
            {kind === "duygu" && st.secret && st.phase !== "reveal" && (
              <div className="relative mt-4 inline-flex items-center gap-2.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2">
                <span className="text-2xl leading-none">{emotion(st.secret)?.emoji}</span>
                <span>
                  <span className="block text-[11px] text-muted">Senin duygun · sadece sen görüyorsun</span>
                  <span className="block text-sm font-semibold text-accent">{emotion(st.secret)?.name}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {error && <Notice>{error}</Notice>}

        {!st ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Hazırlanıyor
          </div>
        ) : st.phase === "record" ? (
          !st.in_round ? (
            <Info title="Bu turda kaydın yok">Diğerleri kaydını bitirince tahmin aşamasına geçilecek.</Info>
          ) : st.my_audio && !editing ? (
            <Info title="Kaydın gönderildi" ok>
              Herkes gönderince {kind === "efekt" ? "oylama" : "tahmin"} başlar ({doneCount}/{inGame.length}).
              <span className="mt-3 flex justify-center gap-2">
                <PlayBtn on={player.now === "mine"} onClick={() => (player.now === "mine" ? player.stop() : player.play("mine", st.my_audio!))} label="Kaydını dinle" />
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Yeniden kaydet
                </Button>
              </span>
            </Info>
          ) : (
            <div className="panel flex flex-col gap-3 p-5">
              <p className="text-sm font-medium">{kind === "efekt" ? "Efekti kaydet" : "Cümleyi oku"}</p>
              <VoiceRecorder
                key={`${st.round}-${editing}`}
                value={null}
                max={PARTY_MAX_SEC[kind]}
                size="md"
                label={`Kaydet (${PARTY_MAX_SEC[kind]} sn)`}
                onChange={(b, ext) => setBlob({ b, ext })}
              />
              <div className="flex gap-2">
                <Button variant="primary" icon={<Send className="size-4" />} loading={busy === "clip"} disabled={!blob || !!busy} onClick={sendClip}>
                  Gönder
                </Button>
                {editing && (
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Vazgeç
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">Kayıt isimsiz yüklenir; açıklamaya kadar kimse kimin olduğunu göremez.</p>
            </div>
          )
        ) : st.phase === "answer" ? (
          myAnswered && !editing ? (
            <Info title={kind === "efekt" ? "Oyun verildi" : "Tahminlerin gönderildi"} ok>
              Herkes bitirince sonuçlar açılır ({doneCount}/{inGame.length}).
              <span className="mt-3 block">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Değiştir
                </Button>
              </span>
            </Info>
          ) : (
            <div className="panel">
              <div className="panel-head">
                <h3 className="text-sm font-medium">
                  {kind === "kim" ? "Bu sesler kimin?" : kind === "efekt" ? "En iyi efekt hangisi?" : "Hangi duyguyla okudular?"}
                </h3>
                <span className="text-xs text-muted">{others.length} kayıt</span>
              </div>
              <ul className="divide-y divide-line">
                {(st.clips ?? []).map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <PlayBtn on={player.now === c.id} onClick={() => (player.now === c.id ? player.stop() : player.play(c.id, c.audio))} label={`Ses ${clipLetter(c.label)} dinle`} />
                      <span className="text-sm font-medium">Ses {clipLetter(c.label)}</span>
                      {c.mine && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">senin kaydın</span>}
                      {kind === "efekt" && !c.mine && (
                        <button
                          role="radio"
                          aria-checked={answers.vote === c.id}
                          onClick={() => setAnswers({ vote: c.id })}
                          className={cx(
                            "ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
                            answers.vote === c.id ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-fg-2 hover:border-accent hover:text-accent",
                          )}
                        >
                          {answers.vote === c.id ? <Check className="size-3.5" /> : <Trophy className="size-3.5" />}
                          {answers.vote === c.id ? "Oyum bu" : "Bu en iyisi"}
                        </button>
                      )}
                    </div>
                    {!c.mine && kind === "kim" && (
                      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Ses ${clipLetter(c.label)} kimin?`}>
                        {(st.players ?? [])
                          .filter((u) => u !== me && people[u])
                          .map((u) => (
                            <Chip key={u} on={answers[c.id] === u} onClick={() => setAnswers({ ...answers, [c.id]: u })}>
                              <Avatar name={person(u).name} color={person(u).color} path={person(u).avatar_path} size={18} />
                              {person(u).name}
                            </Chip>
                          ))}
                      </div>
                    )}
                    {!c.mine && kind === "duygu" && (
                      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Ses ${clipLetter(c.label)} hangi duygu?`}>
                        {st.options.map((o) => (
                          <Chip key={o} on={answers[c.id] === o} onClick={() => setAnswers({ ...answers, [c.id]: o })}>
                            <span>{emotion(o)?.emoji}</span>
                            {emotion(o)?.name}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
                <Button variant="primary" icon={<Send className="size-4" />} loading={busy === "answer"} disabled={!complete || !!busy} onClick={sendAnswers}>
                  {kind === "efekt" ? "Oyu gönder" : "Tahminleri gönder"}
                </Button>
                {editing && (
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Vazgeç
                  </Button>
                )}
                {!complete && <span className="text-xs text-muted">{kind === "efekt" ? "Bir kayda oy ver." : "Her kayıt için bir seçim yap."}</span>}
              </div>
            </div>
          )
        ) : (
          <Reveal st={st} kind={kind} me={me} person={person} player={player} />
        )}

        {st?.phase === "reveal" && (
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted">{lastRound ? "Son tur bitti." : `Sıradaki: tur ${st.round + 1}`}</p>
            {isHost ? (
              <Button variant="primary" icon={<ArrowRight className="size-4" />} loading={busy === "party_next"} disabled={!!busy} onClick={() => hostAction("party_next")}>
                {lastRound ? "Sonuçları gör" : "Sonraki tur"}
              </Button>
            ) : (
              <span className="text-xs text-muted">Oda sahibi devam ettirecek</span>
            )}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <Scoreboard players={inGame} scores={st?.scores ?? {}} gained={st?.phase === "reveal" ? st.round_points : {}} me={me} />
        {st && st.phase !== "reveal" && (
          <div className="panel">
            <div className="panel-head">
              <h3 className="text-sm font-medium">{st.phase === "record" ? "Kaydedenler" : kind === "efekt" ? "Oy verenler" : "Tahmin edenler"}</h3>
              <span className="font-mono text-xs text-muted">
                {doneCount}/{inGame.length}
              </span>
            </div>
            <ul className="flex flex-col gap-1 p-2">
              {inGame.map((p) => (
                <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <Avatar name={p.nickname} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} size={24} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.nickname}</span>
                  {p.done ? <Check className="size-4 text-ok" aria-label="Bitirdi" /> : <span className="text-[11px] text-muted">bekleniyor</span>}
                </li>
              ))}
            </ul>
            {isHost && doneCount < inGame.length && (
              <div className="border-t border-line p-3">
                <Button size="sm" variant="ghost" className="w-full" icon={<SkipForward className="size-3.5" />} loading={busy === "party_skip"} disabled={!!busy} onClick={() => hostAction("party_skip")}>
                  Bekleyenleri atla
                </Button>
              </div>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}

function Reveal({
  st,
  kind,
  me,
  person,
  player,
}: {
  st: PartyState;
  kind: PartyState["kind"];
  me: string;
  person: (u?: string | null) => Person;
  player: ReturnType<typeof useOnePlayer>;
}) {
  const clips = st.clips ?? [];
  const topVotes = Math.max(0, ...clips.map((c) => c.votes ?? 0));
  if (!clips.length) return <Info title="Bu turda kayıt yok">Kimse kayıt göndermedi.</Info>;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="text-sm font-medium">Açıklama</h3>
      </div>
      <ul className="divide-y divide-line">
        {clips.map((c: PartyClip) => {
          const owner = person(c.owner);
          const winner = kind === "efekt" && topVotes > 0 && c.votes === topVotes;
          return (
            <li key={c.id} className={cx("flex flex-col gap-2.5 px-4 py-3.5", winner && "bg-accent/[0.06]")}>
              <div className="flex items-center gap-3">
                <PlayBtn on={player.now === c.id} onClick={() => (player.now === c.id ? player.stop() : player.play(c.id, c.audio))} label={`Ses ${clipLetter(c.label)} dinle`} />
                <span className="font-mono text-xs text-muted">Ses {clipLetter(c.label)}</span>
                <Avatar name={owner.name} color={owner.color} path={owner.avatar_path} frame={owner.frame} size={26} />
                <span className="min-w-0 truncate text-sm font-medium">
                  {owner.name}
                  {c.owner === me && <span className="ml-1 text-xs font-normal text-muted">(sen)</span>}
                </span>
                {kind === "duygu" && c.secret && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs">
                    {emotion(c.secret)?.emoji} {emotion(c.secret)?.name}
                  </span>
                )}
                {kind === "efekt" && (
                  <span className={cx("ml-auto inline-flex items-center gap-1 font-mono text-xs", winner ? "text-accent" : "text-muted")}>
                    {winner && <Crown className="size-3.5" />} {c.votes ?? 0} oy
                  </span>
                )}
              </div>
              {kind !== "efekt" && (c.guesses ?? []).length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pl-11">
                  {(c.guesses ?? []).map((g) => {
                    const ok = kind === "kim" ? g.answer === c.owner : g.answer === c.secret;
                    return (
                      <li
                        key={g.voter}
                        className={cx(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                          ok ? "border-ok/40 bg-ok/10 text-ok" : "border-line text-muted",
                        )}
                      >
                        {person(g.voter).name} → {kind === "kim" ? person(g.answer).name : `${emotion(g.answer)?.emoji} ${emotion(g.answer)?.name}`}
                        {ok ? " ✓" : " ✗"}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Scoreboard({ players, scores, gained, me }: { players: RoomPlayer[]; scores: Record<string, number>; gained: Record<string, number>; me: string }) {
  const rows = [...players].sort((a, b) => (scores[b.user_id] ?? 0) - (scores[a.user_id] ?? 0));
  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="text-sm font-medium">Puan durumu</h3>
      </div>
      <ol className="flex flex-col gap-1 p-2">
        {rows.map((p, i) => (
          <li key={p.user_id} className={cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5", p.user_id === me && "bg-surface-2")}>
            <span className={cx("w-4 text-center font-mono text-xs", i === 0 && (scores[p.user_id] ?? 0) > 0 ? "text-accent" : "text-muted")}>{i + 1}</span>
            <Avatar name={p.nickname} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} size={24} />
            <span className="min-w-0 flex-1 truncate text-sm">{p.nickname}</span>
            {(gained[p.user_id] ?? 0) > 0 && <span className="pop-in font-mono text-[11px] text-ok">+{gained[p.user_id]}</span>}
            <span className="w-6 text-right font-mono text-sm font-semibold">{scores[p.user_id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        on ? "border-accent bg-accent/15 text-accent" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function PlayBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
        on ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-fg-2 hover:border-accent hover:text-accent",
      )}
      aria-label={label}
      onClick={onClick}
    >
      {on ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </button>
  );
}

function Info({ title, children, ok }: { title: string; children: React.ReactNode; ok?: boolean }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className={cx("flex size-11 items-center justify-center rounded-full", ok ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted")}>
        {ok ? <Check className="size-5" /> : <Spinner />}
      </span>
      <p className="font-medium">{title}</p>
      <div className="max-w-sm text-sm text-muted">{children}</div>
    </div>
  );
}

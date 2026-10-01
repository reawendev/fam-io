"use client";

import { Check, Crown, Eye, Laugh, Mic, Send, Shuffle, VenetianMask } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errMsg, sb } from "@/lib/supabase";
import { refreshMe } from "@/lib/auth";
import type { ProfileLite, SceneFull } from "@/lib/types";
import { Avatar, Button, cx, Notice, Spinner } from "./ui";
import { cardInfo } from "@/lib/modes";

type Cat = "mvp" | "komik" | "kart" | "hain";
type Vote = { voter: string; category: Cat; target_user: string | null; target_line: string | null };
type DubInfo = { mode: string; has_impostor: boolean; created_by: string | null };
type Secret = { impostor: string; task: string; revealed: boolean; caught: boolean | null };
type Part = { user_id: string; profiles: ProfileLite | null };
type Rec = { line_id: string; user_id: string };

/**
 * Final oylaması: "Turun seslendirmeni" ve "En komik replik".
 * Sadece o sahnede oynayanlar oy verir, kendine oy verilemez. Aynı seçeneğe tekrar basmak oyu geri alır.
 */
export default function VotePanel({ dubId, scene, me, compact }: { dubId: string; scene: SceneFull; me: string | null; compact?: boolean }) {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<DubInfo | null>(null);
  const [cards, setCards] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<Secret | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const loadSecret = useCallback(async () => {
    const { data } = await sb().from("dub_secrets").select("impostor, task, revealed, caught").eq("dub_id", dubId).maybeSingle();
    const sec = data as Secret | null;
    setSecret(sec?.impostor ? sec : null);
  }, [dubId]);

  const loadVotes = useCallback(async () => {
    const { data } = await sb().from("dub_votes").select("voter, category, target_user, target_line").eq("dub_id", dubId);
    setVotes((data as Vote[]) ?? []);
  }, [dubId]);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: r }, { data: d }, { data: c }, { data: tx }] = await Promise.all([
        sb().from("dub_participants").select("user_id, profiles(username, display_name, color, avatar_path)").eq("dub_id", dubId),
        sb().from("dub_recordings").select("line_id, user_id").eq("dub_id", dubId),
        sb().from("dubs").select("mode, has_impostor, created_by").eq("id", dubId).maybeSingle(),
        sb().from("dub_cards").select("line_id, card").eq("dub_id", dubId),
        sb().from("dub_line_texts").select("line_id, text").eq("dub_id", dubId),
      ]);
      setParts((p as unknown as Part[]) ?? []);
      setRecs((r as Rec[]) ?? []);
      const di = d as DubInfo | null;
      setInfo(di && "mode" in di ? di : { mode: "klasik", has_impostor: false, created_by: null });
      setCards(Object.fromEntries(((c as { line_id: string; card: string }[]) ?? []).map((x) => [x.line_id, x.card])));
      setTexts(Object.fromEntries(((tx as { line_id: string; text: string }[]) ?? []).map((x) => [x.line_id, x.text])));
    })();
    loadVotes();
    loadSecret();
    const ch = sb()
      .channel(`votes:${dubId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dub_votes", filter: `dub_id=eq.${dubId}` }, () => loadVotes())
      .on("postgres_changes", { event: "*", schema: "public", table: "dub_secrets", filter: `dub_id=eq.${dubId}` }, () => loadSecret())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [dubId, loadVotes, loadSecret]);

  const roleById = useMemo(() => Object.fromEntries(scene.scene_roles.map((r) => [r.id, r])), [scene]);
  const lineById = useMemo(() => Object.fromEntries(scene.scene_lines.map((l) => [l.id, l])), [scene]);
  const nameOf = (uid: string) => parts?.find((p) => p.user_id === uid)?.profiles?.display_name ?? "?";
  const canVote = !!me && !!parts?.some((p) => p.user_id === me);

  const byUser = (cat: Cat) => cat === "mvp" || cat === "hain";
  const count = (cat: Cat, target: string) =>
    votes.filter((v) => v.category === cat && (byUser(cat) ? v.target_user : v.target_line) === target).length;
  const myVote = (cat: Cat) => {
    const v = votes.find((x) => x.voter === me && x.category === cat);
    return v ? (byUser(cat) ? v.target_user : v.target_line) : null;
  };
  const top = (cat: Cat, targets: string[]) => {
    const max = Math.max(0, ...targets.map((t) => count(cat, t)));
    return max > 0 ? new Set(targets.filter((t) => count(cat, t) === max)) : new Set<string>();
  };

  async function reveal() {
    setBusy("reveal");
    setError(null);
    const { error } = await sb().rpc("reveal_impostor", { p_dub: dubId });
    if (error) setError(errMsg(error));
    await loadSecret();
    refreshMe().catch(() => {});
    setBusy(null);
  }

  async function postResults() {
    setBusy("post");
    setError(null);
    const { data, error } = await sb().rpc("post_results", { p_dub: dubId });
    setBusy(null);
    if (error) return setError(errMsg(error));
    setSent(data ? "Sonuçlar Discord'a gönderildi." : "Discord bağlı değil (Yönetim → Ayarlar).");
  }

  async function vote(cat: Cat, target: string) {
    setBusy(cat + target);
    setError(null);
    const { error } = await sb().rpc("cast_vote", { p_dub: dubId, p_category: cat, p_target: target });
    if (error) setError(errMsg(error));
    await loadVotes();
    refreshMe().catch(() => {});
    setBusy(null);
  }

  if (!parts)
    return (
      <div className="panel flex items-center gap-2 p-4 text-sm text-muted">
        <Spinner /> Oylama yükleniyor
      </div>
    );

  const people = parts.filter((p) => p.profiles);
  const lines = recs
    .filter((r) => lineById[r.line_id])
    .sort((a, b) => lineById[a.line_id].start_time - lineById[b.line_id].start_time);
  const mvpTop = top("mvp", people.map((p) => p.user_id));
  const funnyTop = top("komik", lines.map((r) => r.line_id));
  const cardLines = lines.filter((r) => cards[r.line_id]);
  const cardTop = top("kart", cardLines.map((r) => r.line_id));
  const voters = new Set(votes.filter((v) => v.category !== "hain").map((v) => v.voter)).size;
  const hainVoters = new Set(votes.filter((v) => v.category === "hain").map((v) => v.voter)).size;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="text-sm font-medium">Oylama</h3>
        <span className="text-xs text-muted">
          {voters}/{people.length} kişi oy verdi
        </span>
      </div>

      <Section icon={<Mic className="size-3.5" />} title="Turun seslendirmeni">
        {people.map((p) => {
          const n = count("mvp", p.user_id);
          const mine = myVote("mvp") === p.user_id;
          const self = p.user_id === me;
          const disabled = !canVote || self || !!busy;
          return (
            <Row
              key={p.user_id}
              onClick={() => !disabled && vote("mvp", p.user_id)}
              disabled={disabled}
              selected={mine}
              lead={<Avatar name={p.profiles!.display_name} color={p.profiles!.color} path={p.profiles!.avatar_path} size={compact ? 22 : 26} />}
              label={
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{p.profiles!.display_name}</span>
                  {self && <span className="text-xs text-muted">(sen)</span>}
                  {mvpTop.has(p.user_id) && <Crown className="size-3.5 shrink-0 text-accent" aria-label="Önde" />}
                </span>
              }
              count={n}
              loading={busy === "mvp" + p.user_id}
            />
          );
        })}
      </Section>

      {lines.length > 0 && info?.mode !== "zincir" && (
        <Section icon={<Laugh className="size-3.5" />} title="En komik replik">
          {lines.map((r) => {
            const l = lineById[r.line_id];
            const role = roleById[l.role_id];
            const n = count("komik", r.line_id);
            const mine = myVote("komik") === r.line_id;
            const self = r.user_id === me;
            const disabled = !canVote || self || !!busy;
            return (
              <Row
                key={r.line_id}
                onClick={() => !disabled && vote("komik", r.line_id)}
                disabled={disabled}
                selected={mine}
                lead={<span className="size-2 shrink-0 rounded-full" style={{ background: role?.color }} />}
                label={
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{texts[r.line_id] ?? l.text ? `“${texts[r.line_id] ?? l.text}”` : `${role?.name} · ${l.start_time.toFixed(1)} sn`}</span>
                      {funnyTop.has(r.line_id) && <Crown className="size-3.5 shrink-0 text-accent" aria-label="Önde" />}
                    </span>
                    <span className="block text-xs text-muted">
                      {role?.name} · {nameOf(r.user_id)}
                      {self ? " (sen)" : ""}
                    </span>
                  </span>
                }
                count={n}
                loading={busy === "komik" + r.line_id}
              />
            );
          })}
        </Section>
      )}

      {cardLines.length > 0 && (
        <Section icon={<Shuffle className="size-3.5" />} title="Kartı en iyi oynayan">
          {cardLines.map((r) => {
            const l = lineById[r.line_id];
            const card = cardInfo(cards[r.line_id]);
            const n = count("kart", r.line_id);
            const self = r.user_id === me;
            const disabled = !canVote || self || !!busy;
            return (
              <Row
                key={r.line_id}
                onClick={() => !disabled && vote("kart", r.line_id)}
                disabled={disabled}
                selected={myVote("kart") === r.line_id}
                lead={<span className="text-base leading-none">{card?.emoji}</span>}
                label={
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{card?.name}</span>
                      {cardTop.has(r.line_id) && <Crown className="size-3.5 shrink-0 text-accent" aria-label="Önde" />}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {nameOf(r.user_id)}
                      {self ? " (sen)" : ""} · {texts[r.line_id] ?? l.text ?? roleById[l.role_id]?.name}
                    </span>
                  </span>
                }
                count={n}
                loading={busy === "kart" + r.line_id}
              />
            );
          })}
        </Section>
      )}

      {info?.has_impostor && (
        <Section icon={<VenetianMask className="size-3.5" />} title="Hain kimdi?">
          {secret?.revealed ? (
            <li className="flex flex-col gap-2 px-2 pb-2">
              <div className={cx("rounded-lg border p-3", secret.caught ? "border-ok/40 bg-ok/[0.06]" : "border-red-500/30 bg-red-500/[0.06]")}>
                <p className="text-sm font-medium">
                  {nameOf(secret.impostor)} {secret.caught ? "yakalandı!" : "kimseye yakalanmadı!"}
                </p>
                <p className="mt-0.5 text-xs text-muted">Görevi: {secret.task}</p>
                <p className="mt-1 text-xs text-fg-2">{secret.caught ? "Doğru tahmin eden herkes +15 XP aldı." : `${nameOf(secret.impostor)} +40 XP aldı.`}</p>
              </div>
              <ul className="flex flex-col gap-0.5 text-xs text-muted">
                {people.map((p) => (
                  <li key={p.user_id} className="flex justify-between px-1">
                    <span className={cx(p.user_id === secret.impostor && "text-fg")}>{p.profiles!.display_name}</span>
                    <span className="font-mono">{count("hain", p.user_id)} oy</span>
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <>
              {secret && secret.impostor === me && (
                <li className="px-2 pb-1 text-xs text-red-300">Hain sensin. Şüpheyi başkasına çek, kendini ele verme.</li>
              )}
              {people.map((p) => {
                const self = p.user_id === me;
                const disabled = !canVote || self || !!busy;
                return (
                  <Row
                    key={p.user_id}
                    onClick={() => !disabled && vote("hain", p.user_id)}
                    disabled={disabled}
                    selected={myVote("hain") === p.user_id}
                    lead={<Avatar name={p.profiles!.display_name} color={p.profiles!.color} path={p.profiles!.avatar_path} size={compact ? 22 : 26} />}
                    label={
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{p.profiles!.display_name}</span>
                        {self && <span className="text-xs text-muted">(sen)</span>}
                      </span>
                    }
                    count={-1}
                    loading={busy === "hain" + p.user_id}
                  />
                );
              })}
              <li className="flex items-center justify-between gap-2 px-2 pt-2">
                <span className="text-xs text-muted">
                  {hainVoters}/{people.length} tahmin
                </span>
                {(info.created_by === me || (canVote && hainVoters >= people.length)) && (
                  <Button size="sm" variant="primary" icon={<Eye className="size-3.5" />} loading={busy === "reveal"} onClick={reveal}>
                    Haini açıkla
                  </Button>
                )}
              </li>
            </>
          )}
        </Section>
      )}

      {info?.created_by === me && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
          <span className="text-xs text-muted">{sent ?? "Sonuçları Discord kanalına gönder"}</span>
          <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} loading={busy === "post"} onClick={postResults}>
            Gönder
          </Button>
        </div>
      )}

      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-muted">
        {canVote
          ? "Her kategoride bir oy. Seçimini değiştirebilir, aynı seçeneğe tekrar basıp geri alabilirsin. Aldığın her oy +10 XP."
          : me
            ? "Sadece bu sahnede oynayanlar oy verebilir."
            : "Sonuçlar herkese açık; oy vermek için bu sahnede oynamış olmak gerekir."}
      </p>
      {error && (
        <div className="px-4 pb-3">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line p-2 last:border-b-0">
      <p className="eyebrow flex items-center gap-1.5 px-2 pt-1 pb-2">
        {icon}
        {title}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Row({
  lead,
  label,
  count,
  selected,
  disabled,
  loading,
  onClick,
}: {
  lead: React.ReactNode;
  label: React.ReactNode;
  count: number;
  selected: boolean;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-pressed={selected}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
          selected ? "bg-accent/10 ring-1 ring-accent/40" : !disabled ? "hover:bg-surface-2" : "cursor-default",
        )}
      >
        {lead}
        <span className="min-w-0 flex-1">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-fg-2">
          {loading ? <Spinner className="size-3.5" /> : selected ? <Check className="size-3.5 text-accent" /> : null}
          {count >= 0 ? count : null}
        </span>
      </button>
    </li>
  );
}

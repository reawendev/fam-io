"use client";

import { Clapperboard, Crown, Heart, Medal, Mic, Play, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, cx, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { levelInfo } from "@/lib/progress";
import { errMsg, sb } from "@/lib/supabase";

type Row = {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  avatar_path: string | null;
  xp: number;
  dubs: number;
  mvp: number;
  likes: number;
};
type CreatorRow = {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  avatar_path: string | null;
  scenes: number;
  plays: number;
  week_plays: number;
  likes: number;
};

const TABS = [
  { id: "week", label: "Bu hafta" },
  { id: "lastweek", label: "Geçen hafta" },
  { id: "all", label: "Tüm zamanlar" },
  { id: "creators", label: "Yapımcılar" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Pazartesi 00:00'a (İstanbul) kalan süre */
function untilReset() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const day = (ist.getDay() + 6) % 7; // 0 = Pazartesi
  const next = new Date(ist);
  next.setDate(ist.getDate() + (7 - day));
  next.setHours(0, 0, 0, 0);
  const ms = next.getTime() - ist.getTime();
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d} gün ${h} saat` : `${h} saat`;
}

export default function Liderlik() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("week");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creators, setCreators] = useState<CreatorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState("");

  useEffect(() => setReset(untilReset()), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        if (tab === "creators") {
          setCreators(null);
          const { data, error } = await sb().rpc("creator_board", { p_limit: 50 });
          if (error) throw error;
          if (!cancelled) setCreators((data as CreatorRow[]) ?? []);
        } else {
          setRows(null);
          const { data, error } = await sb().rpc("leaderboard", { p_period: tab, p_limit: 50 });
          if (error) throw error;
          if (!cancelled) setRows((data as Row[]) ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errMsg(e));
          setRows([]);
          setCreators([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const myId = me.status === "in" ? me.user.id : null;
  const list = tab === "creators" ? creators : rows;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Sıralama"
        title="Liderlik tablosu"
        description={
          tab === "week" ? (
            <>
              Bu haftanın XP sıralaması. Her pazartesi sıfırlanır; haftayı birinci bitiren <span className="text-fg-2">Haftanın Sesi</span> rozetini alır.
              {reset && <span className="text-muted"> Sıfırlanmaya {reset} var.</span>}
            </>
          ) : tab === "lastweek" ? (
            "Geçen haftanın sonuçları. Birinci olan Haftanın Sesi rozetini kazandı."
          ) : tab === "all" ? (
            "Toplam XP'ye göre tüm zamanların sıralaması."
          ) : (
            "Kütüphaneye sahne ekleyenler. Sahneleri ne kadar çok seslendirilirse o kadar yukarıda."
          )
        }
      />

      <div className="mb-6 flex overflow-x-auto rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "h-9 flex-1 shrink-0 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors",
              tab === t.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {list === null ? (
        <BoardSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          icon={tab === "creators" ? <Clapperboard className="size-5" /> : <Trophy className="size-5" />}
          title={tab === "week" ? "Bu hafta henüz kimse puan almadı" : tab === "creators" ? "Henüz yapımcı yok" : "Henüz sıralama yok"}
        >
          {tab === "week"
            ? "Bir sahne tamamla, listenin başına sen yerleş."
            : tab === "creators"
              ? "Kütüphaneye ilk sahneyi ekleyen listenin başına geçer."
              : "Sahneler tamamlandıkça burada sıralama oluşur."}
        </EmptyState>
      ) : tab === "creators" ? (
        <>
          <Podium
            items={(creators ?? []).slice(0, 3).map((c) => ({ ...c, value: `${c.plays} oynanma`, sub: `${c.scenes} sahne` }))}
          />
          <ol className="panel mt-4 divide-y divide-line">
            {(creators ?? []).map((c, i) => (
              <BoardRow key={c.user_id} rank={i + 1} person={c} me={myId === c.user_id}>
                <Stat icon={<Clapperboard className="size-3" />} v={c.scenes} label="sahne" />
                <Stat icon={<Heart className="size-3" />} v={c.likes} label="beğeni" />
                <span className="w-20 text-right font-mono text-sm font-semibold">
                  {c.plays} <span className="text-[11px] font-normal text-muted">oyn.</span>
                </span>
              </BoardRow>
            ))}
          </ol>
        </>
      ) : (
        <>
          {tab === "lastweek" && rows && rows[0] && (
            <div className="panel mb-4 flex items-center gap-3 border-accent/30 bg-accent/[0.05] p-4">
              <Medal className="size-5 shrink-0 text-accent" />
              <p className="text-sm">
                Geçen haftanın sesi:{" "}
                <Link href={`/u/${rows[0].username}`} className="font-medium hover:underline">
                  {rows[0].display_name}
                </Link>{" "}
                <span className="text-muted">· {rows[0].xp} XP</span>
              </p>
            </div>
          )}
          <Podium items={(rows ?? []).slice(0, 3).map((r) => ({ ...r, value: `${r.xp} XP`, sub: `${r.dubs} dublaj` }))} />
          <ol className="panel mt-4 divide-y divide-line">
            {(rows ?? []).map((r, i) => (
              <BoardRow key={r.user_id} rank={i + 1} person={r} me={myId === r.user_id} level={tab === "all" ? levelInfo(r.xp).level : undefined}>
                <Stat icon={<Play className="size-3" />} v={r.dubs} label="dublaj" />
                <Stat icon={<Mic className="size-3" />} v={r.mvp} label="seslendirmen oyu" />
                <Stat icon={<Heart className="size-3" />} v={r.likes} label="beğeni" />
                <span className="w-20 text-right font-mono text-sm font-semibold">
                  {r.xp} <span className="text-[11px] font-normal text-muted">XP</span>
                </span>
              </BoardRow>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

type Person = { user_id: string; username: string; display_name: string; color: string; avatar_path: string | null };

function Podium({ items }: { items: (Person & { value: string; sub: string })[] }) {
  if (items.length === 0) return null;
  // 2 - 1 - 3 düzeni
  const order = [items[1], items[0], items[2]];
  const heights = ["h-20", "h-28", "h-14"];
  const ranks = [2, 1, 3];
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((p, i) =>
        p ? (
          <Link key={p.user_id} href={`/u/${p.username}`} className="group flex flex-col items-center text-center">
            <span className="relative">
              {ranks[i] === 1 && <Crown className="absolute -top-5 left-1/2 size-5 -translate-x-1/2 text-accent" aria-label="Birinci" />}
              <Avatar
                name={p.display_name}
                color={p.color}
                path={p.avatar_path}
                size={ranks[i] === 1 ? 64 : 48}
                className={cx("ring-2", ranks[i] === 1 ? "ring-accent" : "ring-line-strong")}
              />
            </span>
            <span className="mt-2 max-w-full truncate text-sm font-medium group-hover:underline">{p.display_name}</span>
            <span className="font-mono text-xs text-fg-2">{p.value}</span>
            <span className="text-[11px] text-muted">{p.sub}</span>
            <span
              className={cx(
                "mt-2 flex w-full items-start justify-center rounded-t-lg border border-b-0 border-line pt-2 font-mono text-lg font-semibold",
                heights[i],
                ranks[i] === 1 ? "bg-accent/10 text-accent" : "bg-surface text-fg-2",
              )}
            >
              {ranks[i]}
            </span>
          </Link>
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  );
}

function BoardRow({ rank, person, me, level, children }: { rank: number; person: Person; me: boolean; level?: number; children: React.ReactNode }) {
  return (
    <li className={cx("flex items-center gap-3 px-3 py-2.5 sm:px-4", me && "bg-accent/[0.06]")}>
      <span className={cx("w-6 text-center font-mono text-sm", rank <= 3 ? "font-semibold text-accent" : "text-muted")}>{rank}</span>
      <Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={person.display_name} color={person.color} path={person.avatar_path} size={30} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium hover:underline">
            {person.display_name}
            {me && <span className="ml-1.5 text-xs font-normal text-accent">sen</span>}
          </span>
          <span className="block truncate text-[11px] text-muted">
            @{person.username}
            {level ? ` · Lv ${level}` : ""}
          </span>
        </span>
      </Link>
      <span className="flex items-center gap-3 sm:gap-4">{children}</span>
    </li>
  );
}

function Stat({ icon, v, label }: { icon: React.ReactNode; v: number; label: string }) {
  return (
    <span className="hidden items-center gap-1 font-mono text-xs text-muted sm:inline-flex" title={`${v} ${label}`}>
      {icon} {v}
    </span>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true">
      <div className="grid grid-cols-3 items-end gap-4">
        {[20, 28, 14].map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className={cx("rounded-full", i === 1 ? "size-16" : "size-12")} />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="w-full rounded-b-none" style={{ height: h * 4 }} />
          </div>
        ))}
      </div>
      <div className="panel mt-4 divide-y divide-line">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="size-[30px] rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

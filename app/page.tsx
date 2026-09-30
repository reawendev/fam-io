"use client";

import { ArrowRight, Download, Flame, Mic, Timer, Users } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, Button, ButtonLink, cx, Notice, Progress } from "@/components/ui";
import DubCard, { DUB_CARD_SELECT, type DubCardData } from "@/components/DubCard";
import type { StationId } from "@/components/landing/DubbingMachine3D";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import { useMe } from "@/lib/auth";
import { currentStreak, levelInfo, levelTitle, streakDoneToday } from "@/lib/progress";

const DubbingMachine3D = dynamic(() => import("@/components/landing/DubbingMachine3D"), { ssr: false });

const STEPS: { id: StationId; title: string; desc: string; icon: React.ReactNode }[] = [
  { id: "lobi", title: "Oda kur", desc: "Sahneyi seç, 5 haneli kodu paylaş. Herkes kendi karakterini seçer.", icon: <Users className="size-4" /> },
  { id: "kayit", title: "Kaydet", desc: "Önce orijinali dinle, sonra geri sayımla repliğini seslendir.", icon: <Mic className="size-4" /> },
  { id: "miks", title: "Miksle", desc: "Kayıtlar replik aralığına kırpılır, sesler otomatik dengelenir.", icon: <Timer className="size-4" /> },
  { id: "premiyer", title: "Prömiyer", desc: "Final herkesin ekranında aynı saniyede başlar.", icon: <ArrowRight className="size-4" /> },
  { id: "indir", title: "İndir", desc: "Dublajlı videoyu tarayıcıda üret, MP4 olarak kaydet.", icon: <Download className="size-4" /> },
];

export default function Home() {
  const router = useRouter();
  const me = useMe();
  const [feed, setFeed] = useState<DubCardData[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState<StationId | null>(null);
  const wide = useWide();

  useEffect(() => {
    sb()
      .from("dubs")
      .select(DUB_CARD_SELECT)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => setFeed((data as unknown as DubCardData[]) ?? []));
  }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ensureUser();
      const c = code.trim().toUpperCase();
      const { error } = await sb().rpc("join_room", { p_code: c, p_nickname: "" });
      if (error) throw error;
      router.push(`/oda/${c}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="relative overflow-hidden border-b border-line">
        {/* Masaüstü: makine arka planda, sağa yaslı */}
        {wide === true && (
          <div className="absolute inset-0">
            <DubbingMachine3D onStation={setStation} />
          </div>
        )}
        <div className="relative mx-auto grid max-w-6xl px-4 sm:px-6 lg:pointer-events-none lg:min-h-[640px] lg:items-center">
          <div className="max-w-md py-12 lg:pointer-events-none lg:py-20 [&_*]:pointer-events-auto">
            <p className="eyebrow fade-up">Arkadaşlar arası dublaj</p>
            <h1 className="fade-up mt-4 text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[52px]" style={{ animationDelay: "40ms" }}>
              Sahneyi seç.
              <br />
              Karakterini al.
              <br />
              <span className="text-accent">Sesini ver.</span>
            </h1>
            <p className="fade-up mt-5 text-[15px] leading-relaxed text-fg-2" style={{ animationDelay: "80ms" }}>
              Film ve çizgi film sahnelerini arkadaşlarınla seslendir. Finali hep birlikte izle, dublajlı videoyu indir.
              Seri yap, level atla, en uyumlu dublaj partnerini bul.
            </p>

            <div className="fade-up panel mt-8 p-4" style={{ animationDelay: "120ms" }}>
              {me.status === "in" ? (
                <MeStrip />
              ) : me.status === "out" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-fg-2">Oynamak için bir profil oluştur. Sadece kullanıcı adı ve şifre.</p>
                  <div className="flex gap-2">
                    <ButtonLink href="/hesap?mod=kayit" variant="primary" className="flex-1">
                      Profil oluştur
                    </ButtonLink>
                    <ButtonLink href="/hesap" className="flex-1">
                      Giriş yap
                    </ButtonLink>
                  </div>
                </div>
              ) : (
                <div className="h-[76px]" />
              )}
              {me.status === "in" && (
                <>
              <form onSubmit={join} className="mt-3 flex gap-2">
                <input
                  aria-label="Oda kodu"
                  className="field flex-1 font-mono tracking-[0.3em] uppercase placeholder:tracking-normal"
                  placeholder="Oda kodu"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
                <Button type="submit" loading={busy} disabled={code.trim().length < 5}>
                  Katıl
                </Button>
              </form>
              <div className="my-3 flex items-center gap-3 text-[11px] text-muted">
                <span className="h-px flex-1 bg-line" />
                ya da
                <span className="h-px flex-1 bg-line" />
              </div>
              <ButtonLink href="/sahneler" variant="primary" className="w-full" icon={<ArrowRight className="size-4" />}>
                Sahne seç ve oda kur
              </ButtonLink>
                </>
              )}
              {error && (
                <div className="mt-3">
                  <Notice>{error}</Notice>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Mobil / tablet: makine içeriğin altında */}
        {wide === false && (
          <div className="h-[340px] border-t border-line">
            <DubbingMachine3D alignRight={false} onStation={setStation} />
          </div>
        )}
      </section>

      {feed && feed.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Akış</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Son dublajlar</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {feed.map((d) => (
              <DubCard key={d.id} dub={d} />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Nasıl çalışır</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Bir tur, beş adım</h2>
          </div>
          <p className="text-sm text-muted">Makinedeki istasyonlara tıklayarak adımları inceleyebilirsin.</p>
        </div>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={cx(
                "bg-surface p-5 transition-colors duration-300",
                station === s.id && "bg-surface-2",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cx("font-mono text-xs", station === s.id ? "text-accent" : "text-muted")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={cx("transition-colors", station === s.id ? "text-accent" : "text-muted")}>{s.icon}</span>
              </div>
              <h3 className="mt-6 text-[15px] font-medium">{s.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function MeStrip() {
  const me = useMe();
  if (me.status !== "in") return null;
  const p = me.profile;
  const lv = levelInfo(p.xp);
  const streak = currentStreak(p);
  const safe = streakDoneToday(p);
  return (
    <Link href={`/u/${p.username}`} className="-m-1 mb-3 flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-surface-2">
      <Avatar name={p.display_name} color={p.color} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{p.display_name}</p>
          <span className={cx("inline-flex items-center gap-1 font-mono text-xs", streak && safe ? "text-accent" : "text-muted")}>
            <Flame className="size-3.5" /> {streak}
          </span>
        </div>
        <p className="text-xs text-muted">
          Lv {lv.level} · {levelTitle(lv.level)}
          {streak > 0 && !safe ? " · Serin için bugün bir sahne tamamla" : ""}
        </p>
        <Progress value={lv.pct} className="mt-1.5" />
      </div>
    </Link>
  );
}

/** lg kırılımı (1024px) üstü mü? İlk render'da null (SSR ile uyum için). */
function useWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

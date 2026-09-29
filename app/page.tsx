"use client";

import { ArrowRight, Download, Mic, Timer, Users } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink, cx, Notice } from "@/components/ui";
import type { StationId } from "@/components/landing/DubbingMachine3D";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import { useNick } from "@/lib/nickname";

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
  const [nick, setNick] = useNick();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState<StationId | null>(null);
  const wide = useWide();

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!nick.trim()) return setError("Önce bir takma ad yaz.");
    setBusy(true);
    setError(null);
    try {
      await ensureUser();
      const c = code.trim().toUpperCase();
      const { error } = await sb().rpc("join_room", { p_code: c, p_nickname: nick.trim() });
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
              Ücretsiz, kayıt yok, filigran yok.
            </p>

            <div className="fade-up panel mt-8 p-4" style={{ animationDelay: "120ms" }}>
              <label className="eyebrow mb-1.5 block" htmlFor="nick">
                Takma ad
              </label>
              <input
                id="nick"
                className="field"
                placeholder="Arkadaşların seni nasıl görsün?"
                maxLength={30}
                value={nick}
                onChange={(e) => setNick(e.target.value)}
              />
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

"use client";

import { ArrowLeft, ArrowRight, Clapperboard, Flame, Headphones, Library, Mic, Trophy, Users, Vote } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/auth";
import { errMsg, sb } from "@/lib/supabase";
import type { SceneListItem } from "@/lib/types";
import { Button, cx, Modal, Notice } from "./ui";

const EVENT = "famio:onboarding";
const key = (uid: string) => `famio.onboarded.${uid}`;

/** Rehberi elle aç (başlıktaki "Nasıl oynanır?") */
export function openOnboarding() {
  window.dispatchEvent(new Event(EVENT));
}

const STEPS = [
  {
    eyebrow: "Hoş geldin",
    title: "Sahneyi seç, karakterini al, sesini ver",
    body: "fam-io'da arkadaşlarınla film, dizi ve çizgi film sahnelerini seslendirirsin. Herkes kendi repliğini kendi ekranından kaydeder, final hep birlikte izlenir.",
    points: [
      { icon: <Library className="size-4" />, text: "Kütüphaneden bir sahne seç ya da kendin ekle" },
      { icon: <Users className="size-4" />, text: "Oda kur, 5 haneli kodu arkadaşlarına gönder" },
      { icon: <Clapperboard className="size-4" />, text: "Lobide herkes istediği karakteri seçer" },
    ],
  },
  {
    eyebrow: "Kayıt",
    title: "Önce dinle, sonra 3-2-1 ile kaydet",
    body: "Kayıt ekranında her replik sırayla gelir. Geri sayım sırasında çıkan sesler finale girmez, merak etme.",
    points: [
      { icon: <Headphones className="size-4" />, text: "O tuşu: orijinal repliği dinle, tonunu yakala" },
      { icon: <Mic className="size-4" />, text: "R tuşu: kaydet. Beğenmezsen tekrar çek" },
      { icon: <Flame className="size-4" />, text: "Robot, sincap, mağara… efekti sonradan da değiştirebilirsin" },
    ],
  },
  {
    eyebrow: "Final",
    title: "Birlikte izle, oy ver, XP topla",
    body: "Final herkesin ekranında aynı saniyede başlar. Dublaj profillerinize işlenir, linkle paylaşabilir ve videoyu indirebilirsin.",
    points: [
      { icon: <Vote className="size-4" />, text: "Turun seslendirmeni ve en komik repliğe oy ver" },
      { icon: <Trophy className="size-4" />, text: "XP kazan, level atla, rozet topla, haftalık liderliğe gir" },
      { icon: <Clapperboard className="size-4" />, text: "Sahne ekle: başkaları oynadıkça yapımcı XP'si kazanırsın" },
    ],
  },
];

export default function Onboarding() {
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = me.status === "in" ? me.user.id : null;

  // İlk girişte kendiliğinden aç (odadayken ve giriş sayfalarında rahatsız etme)
  useEffect(() => {
    if (!uid || path.startsWith("/oda/") || path.startsWith("/hesap") || path.startsWith("/giris")) return;
    let seen = true;
    try {
      seen = localStorage.getItem(key(uid)) === "1";
    } catch {}
    if (!seen) {
      setStep(0);
      setOpen(true);
    }
  }, [uid, path]);

  useEffect(() => {
    const on = () => {
      setStep(0);
      setError(null);
      setOpen(true);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  function close() {
    setOpen(false);
    if (uid)
      try {
        localStorage.setItem(key(uid), "1");
      } catch {}
  }

  // Tek başına prova: kısa ve az karakterli popüler bir sahnede oda kur, tüm karakterler sende
  async function rehearse() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await sb().rpc("list_scenes", { p_sort: "populer", p_limit: 40 });
      if (error) throw error;
      const list = ((data as SceneListItem[]) ?? []).filter((s) => s.line_count > 0);
      if (!list.length) throw new Error("Kütüphanede henüz sahne yok. Önce bir sahne ekle.");
      const pick = [...list].sort((a, b) => a.role_count * 10 + (a.duration ?? 60) / 10 - (b.role_count * 10 + (b.duration ?? 60) / 10))[0];
      const { data: code, error: e2 } = await sb().rpc("create_room", { p_scene: pick.id, p_nickname: "" });
      if (e2) throw e2;
      close();
      router.push(`/oda/${code}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open || !uid) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Modal onClose={close} label="fam-io rehberi" className="max-w-lg overflow-hidden">
      <div className="relative border-b border-line bg-surface-2/60 px-6 pt-6 pb-5">
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={cx("h-1 rounded-full transition-all duration-300", i === step ? "w-6 bg-accent" : i < step ? "w-3 bg-fg-2" : "w-3 bg-line-strong")} />
          ))}
          <span className="ml-auto font-mono text-[11px] text-muted">
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <p className="eyebrow mt-5">{s.eyebrow}</p>
        <h2 key={step} className="fade-up mt-2 text-xl font-semibold tracking-tight">
          {s.title}
        </h2>
      </div>
      <div key={step} className="fade-up flex flex-col gap-4 px-6 py-5">
        <p className="text-sm leading-relaxed text-fg-2">{s.body}</p>
        <ul className="flex flex-col gap-2.5">
          {s.points.map((p, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent">{p.icon}</span>
              {p.text}
            </li>
          ))}
        </ul>
        {last && (
          <div className="rounded-lg border border-accent/25 bg-accent/[0.06] p-3.5">
            <p className="text-sm font-medium">Önce tek başına dene</p>
            <p className="mt-0.5 text-xs text-muted">Kısa bir sahnede tüm karakterleri sen seslendirirsin. Kimseyi beklemeden kaydı ve finali görmüş olursun.</p>
          </div>
        )}
        {error && <Notice>{error}</Notice>}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-6 py-4">
        {step > 0 ? (
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={() => setStep(step - 1)}>
            Geri
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={close}>
            Atla
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {last ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  close();
                  router.push("/sahneler");
                }}
              >
                Sahnelere göz at
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={rehearse}>
                Tek başına prova
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" icon={<ArrowRight className="size-3.5" />} onClick={() => setStep(step + 1)}>
              Devam
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

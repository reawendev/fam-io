"use client";

import { CircleHelp, Flame, Gamepad2, LogOut, Shield, ShoppingBag, Trophy, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useMe } from "@/lib/auth";
import { useIsAdmin } from "@/lib/admin";
import { openOnboarding } from "./Onboarding";
import { currentStreak, levelInfo, streakDoneToday } from "@/lib/progress";
import { Avatar, btn, cx, Logo, UserName } from "./ui";

const NAV = [
  { href: "/oyna", label: "Oyna" },
  { href: "/sahneler", label: "Sahneler" },
  { href: "/liderlik", label: "Liderlik" },
  { href: "/ekipler", label: "Ekipler" },
  { href: "/magaza", label: "Mağaza" },
  { href: "/sahneler/yeni", label: "Sahne ekle" },
];

export default function SiteHeader() {
  const path = usePathname();
  const router = useRouter();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const admin = useIsAdmin();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  const inRoom = path.startsWith("/oda/");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-sm supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-[15px]" aria-label="fam-io ana sayfa">
          <Logo />
        </Link>
        {!inRoom && (
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.href === "/sahneler" ? path === "/sahneler" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx("rounded-md px-2.5 py-1.5 text-[13px] transition-colors", active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {me.status === "in" ? (
            <>
              <StreakChip streak={currentStreak(me.profile)} safe={streakDoneToday(me.profile)} />
              <div className="relative" ref={menuRef}>
                <button
                  className="flex h-8 items-center gap-2 rounded-md pr-2 pl-1 text-[13px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  aria-haspopup="menu"
                >
                  <Avatar name={me.profile.display_name} color={me.profile.color} path={me.profile.avatar_path} frame={me.profile.equipped?.frame} size={24} />
                  <UserName name={me.profile.display_name} fx={me.profile.equipped?.name} className="hidden max-w-32 truncate sm:inline" />
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">Lv {levelInfo(me.profile.xp).level}</span>
                </button>
                {open && (
                  <div role="menu" className="panel absolute right-0 mt-1.5 w-48 overflow-hidden p-1 shadow-xl shadow-black/40">
                    <Link role="menuitem" href={`/u/${me.profile.username}`} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2">
                      <UserRound className="size-4 text-muted" /> Profilim
                    </Link>
                    <Link role="menuitem" href="/oyna" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2 md:hidden">
                      <Gamepad2 className="size-4 text-muted" /> Oyun kur
                    </Link>
                    <Link role="menuitem" href="/liderlik" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2 md:hidden">
                      <Trophy className="size-4 text-muted" /> Liderlik
                    </Link>
                    <Link role="menuitem" href="/ekipler" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2 md:hidden">
                      <Users className="size-4 text-muted" /> Ekipler
                    </Link>
                    <Link role="menuitem" href="/magaza" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2">
                      <ShoppingBag className="size-4 text-muted" /> Mağaza
                    </Link>
                    {admin && (
                      <Link role="menuitem" href="/yonetim" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2">
                        <Shield className="size-4 text-muted" /> Yönetim
                      </Link>
                    )}
                    <button
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        setOpen(false);
                        openOnboarding();
                      }}
                    >
                      <CircleHelp className="size-4 text-muted" /> Nasıl oynanır?
                    </button>
                    <div className="my-1 h-px bg-line" />
                    <button
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={async () => {
                        await signOut();
                        router.push("/");
                      }}
                    >
                      <LogOut className="size-4 text-muted" /> Çıkış yap
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : me.status === "out" ? (
            <>
              <Link href={`/hesap?next=${encodeURIComponent(path)}`} className={btn("ghost", "sm")}>
                Giriş yap
              </Link>
              <Link href={`/hesap?mod=kayit&next=${encodeURIComponent(path)}`} className={btn("primary", "sm")}>
                Profil oluştur
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function StreakChip({ streak, safe }: { streak: number; safe: boolean }) {
  return (
    <span
      title={
        streak === 0
          ? "Seri yok. Bugün bir sahne tamamla, seri başlasın."
          : safe
            ? `${streak} günlük seri. Bugün tamamlandı.`
            : `${streak} günlük seri. Bozulmaması için bugün bir sahne tamamla.`
      }
      className={cx(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 font-mono text-xs",
        streak === 0 ? "text-muted" : safe ? "bg-accent/10 text-accent" : "bg-surface-2 text-fg-2",
      )}
    >
      <Flame className={cx("size-3.5", streak > 0 && safe && "fill-accent/30")} />
      {streak}
    </span>
  );
}

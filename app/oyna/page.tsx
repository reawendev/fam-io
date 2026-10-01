"use client";

import { ArrowRight, Clapperboard, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MODE_ICON } from "@/components/room/ModePicker";
import { Button, ButtonLink, cx, Notice, PageHeader } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { MODES } from "@/lib/modes";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import type { GameMode } from "@/lib/types";

/** Oyun kur: önce modu seç, oda hemen açılsın */
export default function Oyna() {
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState<GameMode | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function create(mode: GameMode) {
    setBusy(mode);
    setError(null);
    try {
      await ensureUser();
      const { data, error } = await sb().rpc("create_game", { p_mode: mode });
      if (error) throw error;
      router.push(`/oda/${data}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy("join");
    setError(null);
    const c = code.trim().toUpperCase();
    const { error } = await sb().rpc("join_room", { p_code: c, p_nickname: "" });
    if (error) {
      setError(errMsg(error));
      return setBusy(null);
    }
    router.push(`/oda/${c}`);
  }


  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Oyun kur"
        title="Ne oynuyoruz?"
        description="Modu seç, oda hemen açılsın. Sahne gereken modlarda rastgele bir sahne gelir; lobide istediğinle değiştirebilirsin."
      />

      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {me.status !== "in" && me.status !== "loading" && (
        <div className="panel mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted">Oda kurmak için giriş yap.</p>
          <ButtonLink href="/hesap?next=/oyna" variant="primary" size="sm">
            Giriş yap
          </ButtonLink>
        </div>
      )}

      {[
        { title: "Sahnesiz oyunlar", sub: "Video yok, sadece sesiniz. Hemen başlar.", list: MODES.filter((m) => !m.scene) },
        { title: "Sahneli oyunlar", sub: "Kütüphaneden rastgele bir sahne gelir; lobide değiştirebilirsin.", list: MODES.filter((m) => m.scene) },
      ].map((g) => (
        <section key={g.title} className="mb-8">
          <div className="mb-3">
            <h2 className="text-sm font-medium">{g.title}</h2>
            <p className="text-xs text-muted">{g.sub}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.list.map((m) => (
              <button
                key={m.id}
                onClick={() => create(m.id)}
                disabled={!!busy || me.status !== "in"}
                className={cx(
                  "panel group flex flex-col gap-3 p-4 text-left transition-colors hover:border-line-strong disabled:cursor-default disabled:hover:border-line",
                  busy === m.id && "border-accent/50",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cx(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
                      m.scene ? "bg-surface-2 text-fg-2" : "bg-accent/12 text-accent",
                    )}
                  >
                    {MODE_ICON[m.id]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{m.name}</span>
                    <span className="block text-xs text-muted">{m.short}</span>
                  </span>
                  {busy === m.id ? <span className="text-xs text-accent">Açılıyor…</span> : <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />}
                </span>
                <span className="text-[13px] leading-relaxed text-fg-2">{m.desc.replace("Aşağıdaki eklerle", "Lobide eklerle")}</span>
                <span className="mt-auto flex flex-wrap items-center gap-3 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" /> {m.min}+ kişi
                  </span>
                  {m.scene && (
                    <span className="inline-flex items-center gap-1">
                      <Clapperboard className="size-3.5" /> Sahne rastgele gelir
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={join} className="panel flex flex-col gap-3 p-4">
          <h2 className="text-sm font-medium">Arkadaşın oda mı kurdu?</h2>
          <div className="flex gap-2">
            <input
              aria-label="Oda kodu"
              className="field flex-1 font-mono tracking-[0.3em] uppercase placeholder:tracking-normal"
              placeholder="Oda kodu"
              maxLength={5}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <Button type="submit" loading={busy === "join"} disabled={code.length < 5 || me.status !== "in"}>
              Katıl
            </Button>
          </div>
        </form>
        <div className="panel flex flex-col justify-between gap-3 p-4">
          <h2 className="text-sm font-medium">Belli bir sahneyi mi oynamak istiyorsun?</h2>
          <ButtonLink href="/sahneler" size="sm" className="self-start" icon={<ArrowRight className="size-4" />}>
            Sahne seç
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}

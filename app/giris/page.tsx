import { Lock } from "lucide-react";
import { Logo } from "@/components/ui";

export default async function Giris({ searchParams }: { searchParams: Promise<{ next?: string; hata?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-8">
        <Logo className="text-lg" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Bu site arkadaşlara özel</h1>
        <p className="mt-1.5 text-sm text-muted">Devam etmek için sana verilen şifreyi gir.</p>
      </div>
      <form method="post" action="/api/giris" className="panel flex flex-col gap-3 p-4">
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <label className="eyebrow" htmlFor="pw">
          Şifre
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input id="pw" className="field pl-9" type="password" name="password" autoFocus required />
        </div>
        {sp.hata && <p className="text-sm text-red-300">Şifre yanlış.</p>}
        <button className="inline-flex h-10 items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover">
          Devam et
        </button>
      </form>
    </main>
  );
}

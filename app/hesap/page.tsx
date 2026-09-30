"use client";

import { Check, Eye, EyeOff, LogOut, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Avatar, Button, ButtonLink, cx, Logo, Notice, Spinner } from "@/components/ui";
import { normUsername, signIn, signOut, signUp, useMe, usernameAvailable, USERNAME_RE } from "@/lib/auth";

export default function HesapPage() {
  return (
    <Suspense fallback={null}>
      <Hesap />
    </Suspense>
  );
}

function Hesap() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const me = useMe();
  const [tab, setTab] = useState<"giris" | "kayit">(params.get("mod") === "kayit" ? "kayit" : "giris");

  if (me.status === "loading")
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Yükleniyor
        </div>
      </Shell>
    );

  if (me.status === "in")
    return (
      <Shell>
        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <Avatar name={me.profile.display_name} color={me.profile.color} size={40} />
            <div className="min-w-0">
              <p className="font-medium">{me.profile.display_name}</p>
              <p className="text-sm text-muted">@{me.profile.username}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <ButtonLink href={next !== "/" ? next : `/u/${me.profile.username}`} variant="primary" className="flex-1">
              {next !== "/" ? "Devam et" : "Profilime git"}
            </ButtonLink>
            <Button icon={<LogOut className="size-4" />} onClick={() => signOut()}>
              Çıkış
            </Button>
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell>
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-line bg-surface p-1 text-sm">
        {(
          [
            ["giris", "Giriş yap"],
            ["kayit", "Profil oluştur"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx("h-8 rounded-md font-medium transition-colors", tab === id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "giris" ? (
        <LoginForm onDone={() => router.replace(next)} />
      ) : (
        <SignupForm onDone={(u) => router.replace(next !== "/" ? next : `/u/${u}`)} />
      )}
    </Shell>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="panel flex flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await signIn(username, password);
          onDone();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="Kullanıcı adı" htmlFor="u">
        <input id="u" className="field" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
      </Field>
      <Field label="Şifre" htmlFor="p">
        <PasswordInput id="p" value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>
      {error && <Notice>{error}</Notice>}
      <Button variant="primary" loading={busy} disabled={!username || !password}>
        Giriş yap
      </Button>
      <p className="text-xs text-muted">Şifreni unuttuysan site sahibinden sıfırlamasını iste.</p>
    </form>
  );
}

function SignupForm({ onDone }: { onDone: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [avail, setAvail] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const u = normUsername(username);

  useEffect(() => {
    if (!u) return setAvail("idle");
    if (!USERNAME_RE.test(u)) return setAvail("invalid");
    setAvail("checking");
    const t = setTimeout(async () => {
      try {
        setAvail((await usernameAvailable(u)) ? "ok" : "taken");
      } catch {
        setAvail("idle");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [u]);

  const pwOk = password.length >= 6;
  const match = password === password2;
  const can = avail === "ok" && pwOk && match && displayName.trim().length > 0;

  return (
    <form
      className="panel flex flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!can) return;
        setBusy(true);
        setError(null);
        try {
          await signUp(u, password, displayName);
          onDone(u);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field
        label="Kullanıcı adı"
        htmlFor="su"
        hint={
          avail === "invalid" ? (
            <span className="text-red-300">3–20 karakter; küçük harf, rakam, _ ve .</span>
          ) : avail === "taken" ? (
            <span className="inline-flex items-center gap-1 text-red-300">
              <X className="size-3" /> Alınmış
            </span>
          ) : avail === "ok" ? (
            <span className="inline-flex items-center gap-1 text-ok">
              <Check className="size-3" /> Müsait
            </span>
          ) : avail === "checking" ? (
            <span className="text-muted">Kontrol ediliyor…</span>
          ) : (
            <span className="text-muted">Profil linkin: /u/kullaniciadi</span>
          )
        }
      >
        <input
          id="su"
          className="field"
          autoComplete="username"
          autoCapitalize="none"
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value.toLocaleLowerCase("en").replace(/\s/g, ""))}
          autoFocus
          required
        />
      </Field>
      <Field label="Görünen ad" htmlFor="dn" hint={<span className="text-muted">Arkadaşların seni bu adla görür</span>}>
        <input id="dn" className="field" maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </Field>
      <Field label="Şifre" htmlFor="sp" hint={password && !pwOk ? <span className="text-red-300">En az 6 karakter</span> : undefined}>
        <PasswordInput id="sp" value={password} onChange={setPassword} autoComplete="new-password" />
      </Field>
      <Field label="Şifre (tekrar)" htmlFor="sp2" hint={password2 && !match ? <span className="text-red-300">Şifreler aynı değil</span> : undefined}>
        <PasswordInput id="sp2" value={password2} onChange={setPassword2} autoComplete="new-password" />
      </Field>
      {error && <Notice>{error}</Notice>}
      <Button variant="primary" loading={busy} disabled={!can}>
        Profil oluştur
      </Button>
    </form>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="eyebrow" htmlFor={htmlFor}>
          {label}
        </label>
        {hint && <span className="text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className="field pr-10"
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
        aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-6">
        <Link href="/">
          <Logo className="text-lg" />
        </Link>
        <p className="mt-4 text-sm text-muted">Oynamak, dublajlarını profilinde toplamak ve seri yapmak için bir profil gerekli.</p>
      </div>
      {children}
    </main>
  );
}

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/hesap") ? n : "/";
}

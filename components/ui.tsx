"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { avatarUrl } from "@/lib/supabase";
import AvatarDecoration from "./fx/AvatarDecoration";
import { NameStyle, NAME_STYLES } from "./fx/NameStyle";
import { GradientText } from "./fx/GradientText";
import { GlitchText } from "./fx/GlitchText";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "rec";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface-2 text-fg hover:bg-surface-3 hover:border-[#3a3a40]",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15",
  rec: "bg-rec text-white hover:bg-red-500",
};
const sizes: Record<Size, string> = {
  sm: "h-8 rounded-md px-3 text-[13px]",
  md: "h-10 rounded-lg px-4 text-sm",
  lg: "h-12 rounded-lg px-5 text-[15px]",
};

export function btn(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={btn(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={btn(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-4 animate-spin text-muted", className)} />;
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span className={cx("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function RoleTag({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cx("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium", className)}
      style={{ borderColor: color + "40", background: color + "14", color }}
    >
      <Swatch color={color} className="size-1.5" />
      {name}
    </span>
  );
}

const AVATAR_TONES = ["#f97316", "#38bdf8", "#a3e635", "#f472b6", "#c084fc", "#facc15", "#2dd4bf", "#fb7185"];
/**
 * Profil fotoğrafı; yoksa (ya da yüklenemezse) baş harf. `path` avatars bucket'ındaki yol,
 * `src` doğrudan adres (ör. yükleme önizlemesi).
 */
export function Avatar(props: {
  name: string;
  size?: number;
  color?: string;
  path?: string | null;
  src?: string | null;
  className?: string;
  /** Mağazadan alınmış çerçeve (frame_altin …) */
  frame?: string;
}) {
  if (props.frame) {
    const size = props.size ?? 28;
    return (
      <span className="avatar-deco" style={{ width: size, height: size }}>
        <AvatarCore {...props} />
        <AvatarDecoration id={props.frame} size={size} />
      </span>
    );
  }
  return <AvatarCore {...props} />;
}

/** İsim; mağazadan alınmış isim efektiyle */
export function UserName({ name, fx, className }: { name: string; fx?: string; className?: string }) {
  if (fx === "name_aurora") return <GradientText className={className}>{name}</GradientText>;
  if (fx === "name_glitch") return <GlitchText text={name} className={className} />;
  if (fx && NAME_STYLES.includes(fx)) return <NameStyle id={fx} name={name} className={className} />;
  return <span className={className}>{name}</span>;
}

function AvatarCore({
  name,
  size = 28,
  color,
  path,
  src,
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  path?: string | null;
  src?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = color ?? AVATAR_TONES[h % AVATAR_TONES.length];
  const url = src ?? avatarUrl(path);
  if (url && broken !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(url)}
        className={cx("shrink-0 rounded-full bg-surface-3 object-cover", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, fontSize: size * 0.42, background: tone + "22", color: tone }}
      aria-hidden
    >
      {name.slice(0, 1).toLocaleUpperCase("tr")}
    </span>
  );
}

/** Yüklenirken içerik iskeleti */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx("skeleton rounded-md", className)} style={style} aria-hidden />;
}

/** Boş durum: ikon + başlık + açıklama + isteğe bağlı aksiyon */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("panel flex flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      <span className="empty-icon relative flex size-12 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">{icon}</span>
      <div>
        <p className="font-medium">{title}</p>
        {children && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** Ortalanmış diyalog; Esc ve dış tıklama kapatır */
export function Modal({
  onClose,
  children,
  className,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cx("panel pop-in w-full max-w-md shadow-2xl shadow-black/50", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "rec" | "fg" }) {
  const bg = tone === "rec" ? "bg-rec" : tone === "fg" ? "bg-fg" : "bg-accent";
  return (
    <div className={cx("h-1 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-150", bg)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "info" | "warn"; children: ReactNode }) {
  const t =
    tone === "error"
      ? "border-red-500/25 bg-red-500/[0.07] text-red-300"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-400/[0.06] text-amber-200"
        : "border-line bg-surface-2 text-fg-2";
  return <div className={cx("rounded-lg border px-3.5 py-2.5 text-sm", t)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-6 sm:pt-12">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="#18181b" stroke="#2e2e33" />
        <rect x="5" y="8.5" width="2" height="5" rx="1" fill="#ff7a1a" />
        <rect x="8.5" y="5.5" width="2" height="11" rx="1" fill="#ff7a1a" />
        <rect x="12" y="7.5" width="2" height="7" rx="1" fill="#ededee" />
        <rect x="15.5" y="9.5" width="2" height="3" rx="1" fill="#ededee" />
      </svg>
      <span>fam-io</span>
    </span>
  );
}

export const PROFILE_COLORS = AVATAR_TONES;

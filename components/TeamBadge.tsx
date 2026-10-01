"use client";

import { publicUrl } from "@/lib/supabase";
import { cx } from "./ui";

/** Ekip logosu; yoksa renkli etiket kutusu */
export default function TeamBadge({
  tag,
  color,
  logo,
  size = 36,
  className,
}: {
  tag: string;
  color: string;
  logo?: string | null;
  size?: number;
  className?: string;
}) {
  if (logo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={publicUrl("avatars", logo)}
        alt=""
        width={size}
        height={size}
        className={cx("shrink-0 rounded-lg object-cover ring-1 ring-line-strong", className)}
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-lg font-mono font-bold tracking-tight", className)}
      style={{ width: size, height: size, fontSize: size * (tag.length > 3 ? 0.26 : 0.32), background: color + "22", color, boxShadow: `inset 0 0 0 1px ${color}55` }}
      aria-hidden
    >
      {tag}
    </span>
  );
}

"use client";

import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { publicUrl } from "@/lib/supabase";
import type { ProfileLite } from "@/lib/types";
import { Avatar, cx } from "./ui";

/** "Oluşturan: X" etiketi — sahneyi kütüphaneye ekleyen kişi */
export function CreatorTag({
  creator,
  className,
  size = "sm",
  label = "Oluşturan",
  link = true,
}: {
  creator: ProfileLite | null | undefined;
  className?: string;
  size?: "sm" | "md";
  label?: string;
  /** Başka bir linkin içindeyse false (iç içe <a> olmasın) */
  link?: boolean;
}) {
  if (!creator) return null;
  const av = size === "md" ? 22 : 16;
  const cls = cx(
    "group/creator inline-flex max-w-full items-center gap-1.5 rounded-md text-muted transition-colors hover:text-fg",
    size === "md" ? "text-[13px]" : "text-[11px]",
    className,
  );
  const inner = (
    <>
      <Clapperboard className={cx("shrink-0", size === "md" ? "size-3.5" : "size-3")} aria-hidden />
      <span className="shrink-0">{label}:</span>
      <Avatar name={creator.display_name} color={creator.color} path={creator.avatar_path} size={av} />
      <span className="truncate font-medium text-fg-2 group-hover/creator:text-fg">{creator.display_name}</span>
    </>
  );
  const title = `Sahneyi ekleyen: ${creator.display_name}`;
  return link ? (
    <Link href={`/u/${creator.username}`} className={cls} title={title}>
      {inner}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

/**
 * Sahne kapağı: kapak görseli varsa onu (hafif), yoksa videonun ilk karesini gösterir.
 * Üzerine gelince video önizlemesi oynar.
 */
export function SceneThumb({
  videoPath,
  thumbPath,
  className,
  preview = true,
  children,
}: {
  videoPath: string;
  thumbPath?: string | null;
  className?: string;
  preview?: boolean;
  children?: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const showImg = !!thumbPath && imgOk;
  return (
    <div
      className={cx("relative aspect-video overflow-hidden bg-black", className)}
      onMouseEnter={() => preview && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicUrl("scenes", thumbPath!)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgOk(false)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {(!showImg || hover) && (
        <video
          src={publicUrl("scenes", videoPath) + "#t=1"}
          preload="metadata"
          muted
          playsInline
          loop
          autoPlay={hover}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {children}
    </div>
  );
}

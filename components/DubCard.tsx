"use client";

import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/progress";
import type { ProfileLite } from "@/lib/types";
import { CreatorTag, SceneThumb } from "./SceneBits";
import { Avatar, Skeleton } from "./ui";

export const DUB_CARD_SELECT =
  "id, created_at, like_count, comment_count, scene_id, scenes(title, video_path, thumb_path, creator:profiles(username, display_name, color, avatar_path)), dub_participants(user_id, lines, xp_gained, profiles(username, display_name, color, avatar_path))";

export type DubCardData = {
  id: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  scene_id: string;
  scenes: { title: string; video_path: string; thumb_path?: string | null; creator?: ProfileLite | null } | null;
  dub_participants: { user_id: string; lines: number; xp_gained: number; profiles: ProfileLite | null }[];
};

export default function DubCard({ dub, highlight }: { dub: DubCardData; highlight?: string }) {
  const people = dub.dub_participants.filter((p) => p.profiles);
  return (
    <Link href={`/d/${dub.id}`} className="panel group flex flex-col overflow-hidden transition-colors hover:border-line-strong">
      {dub.scenes ? (
        <SceneThumb videoPath={dub.scenes.video_path} thumbPath={dub.scenes.thumb_path} preview={false} className="opacity-95 transition-opacity group-hover:opacity-100" />
      ) : (
        <div className="aspect-video bg-black" />
      )}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-medium">{dub.scenes?.title ?? "Silinmiş sahne"}</h3>
          <span className="shrink-0 text-[11px] text-muted">{timeAgo(dub.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {people.slice(0, 5).map((p) => (
              <span key={p.user_id} className="rounded-full ring-2 ring-surface">
                <Avatar name={p.profiles!.display_name} color={p.profiles!.color} path={p.profiles!.avatar_path} size={22} />
              </span>
            ))}
          </div>
          <span className="line-clamp-1 text-xs text-fg-2">
            {people
              .map((p) => p.profiles!.display_name)
              .sort((a, b) => (a === highlight ? -1 : b === highlight ? 1 : 0))
              .join(", ")}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-0.5">
          <CreatorTag creator={dub.scenes?.creator} link={false} label="Sahne" className="min-w-0" />
          <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" /> {dub.like_count}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3" /> {dub.comment_count}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function DubCardSkeleton() {
  return (
    <div className="panel flex flex-col overflow-hidden">
      <Skeleton className="aspect-video rounded-none" />
      <div className="flex flex-col gap-3 p-3.5">
        <Skeleton className="h-4 w-3/5" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-[22px] rounded-full" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

"use client";

import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { publicUrl } from "@/lib/supabase";
import { timeAgo } from "@/lib/progress";
import type { ProfileLite } from "@/lib/types";
import { Avatar } from "./ui";

export const DUB_CARD_SELECT =
  "id, created_at, like_count, comment_count, scene_id, scenes(title, video_path), dub_participants(user_id, lines, xp_gained, profiles(username, display_name, color))";

export type DubCardData = {
  id: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  scene_id: string;
  scenes: { title: string; video_path: string } | null;
  dub_participants: { user_id: string; lines: number; xp_gained: number; profiles: ProfileLite | null }[];
};

export default function DubCard({ dub, highlight }: { dub: DubCardData; highlight?: string }) {
  const people = dub.dub_participants.filter((p) => p.profiles);
  return (
    <Link href={`/d/${dub.id}`} className="panel group flex flex-col overflow-hidden transition-colors hover:border-line-strong">
      <div className="relative aspect-video bg-black">
        {dub.scenes && (
          <video
            src={publicUrl("scenes", dub.scenes.video_path) + "#t=1"}
            preload="metadata"
            muted
            playsInline
            className="size-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-medium">{dub.scenes?.title ?? "Silinmiş sahne"}</h3>
          <span className="shrink-0 text-[11px] text-muted">{timeAgo(dub.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {people.slice(0, 5).map((p) => (
              <span key={p.user_id} className="rounded-full ring-2 ring-surface">
                <Avatar name={p.profiles!.display_name} color={p.profiles!.color} size={22} />
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
        <div className="mt-auto flex items-center gap-3 font-mono text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" /> {dub.like_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" /> {dub.comment_count}
          </span>
        </div>
      </div>
    </Link>
  );
}

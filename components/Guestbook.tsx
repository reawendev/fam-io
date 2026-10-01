"use client";

import { BookOpen, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useIsAdmin } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { timeAgo } from "@/lib/progress";
import { errMsg, sb } from "@/lib/supabase";
import type { ProfileLite } from "@/lib/types";
import { Avatar, Button, ButtonLink, IconButton, Notice, UserName } from "./ui";

type Entry = { id: string; author: string; body: string; created_at: string; profiles: ProfileLite | null };

/** Profil yorumları (ziyaretçi defteri). Yazan, profil sahibi ve yöneticiler silebilir. */
export default function Guestbook({ profileId, ownerName, isOwner }: { profileId: string; ownerName: string; isOwner: boolean }) {
  const me = useMe();
  const admin = useIsAdmin();
  const path = usePathname();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb()
      .from("profile_comments")
      .select("id, author, body, created_at, profiles!profile_comments_author_fkey(username, display_name, color, avatar_path, equipped)")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) setError(errMsg(error));
    setItems((data as unknown as Entry[]) ?? []);
  }, [profileId]);

  useEffect(() => {
    load();
    const ch = sb()
      .channel(`guestbook:${profileId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_comments", filter: `profile_id=eq.${profileId}` }, () => load())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [profileId, load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await sb().from("profile_comments").insert({ profile_id: profileId, body: draft.trim() });
    setBusy(false);
    if (error) return setError(errMsg(error));
    setDraft("");
    load();
  }

  async function remove(id: string) {
    const { error } = await sb().from("profile_comments").delete().eq("id", id);
    if (error) return setError(errMsg(error));
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
  }

  const uid = me.status === "in" ? me.user.id : null;
  const shown = all ? items ?? [] : (items ?? []).slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="size-4 text-muted" /> Ziyaretçi defteri
        </h2>
        <span className="font-mono text-xs text-muted">{items?.length ?? ""}</span>
      </div>
      {me.status === "in" ? (
        <form onSubmit={post} className="flex items-end gap-2 border-b border-line p-3">
          <textarea
            className="field min-h-10 flex-1 resize-none py-2"
            rows={1}
            maxLength={300}
            placeholder={isOwner ? "Kendi defterine not bırak" : `${ownerName} için bir şey yaz`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
          <Button variant="primary" loading={busy} disabled={!draft.trim()} icon={<Send className="size-4" />} aria-label="Gönder" />
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm text-muted">
          Yazmak için giriş yap.
          <ButtonLink href={`/hesap?next=${encodeURIComponent(path)}`} size="sm">
            Giriş yap
          </ButtonLink>
        </div>
      )}
      {error && (
        <div className="p-3">
          <Notice>{error}</Notice>
        </div>
      )}
      {items && items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Henüz kimse yazmadı. İlk notu sen bırak.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((c) => (
            <li key={c.id} className="group flex gap-3 px-4 py-3">
              {c.profiles ? (
                <Link href={`/u/${c.profiles.username}`}>
                  <Avatar name={c.profiles.display_name} color={c.profiles.color} path={c.profiles.avatar_path} frame={c.profiles.equipped?.frame} size={28} />
                </Link>
              ) : (
                <Avatar name="?" size={28} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  {c.profiles && (
                    <Link href={`/u/${c.profiles.username}`} className="font-medium hover:underline">
                      <UserName name={c.profiles.display_name} fx={c.profiles.equipped?.name} />
                    </Link>
                  )}
                  <span className="ml-2 text-xs text-muted">{timeAgo(c.created_at)}</span>
                </p>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-fg-2">{c.body}</p>
              </div>
              {uid && (uid === c.author || isOwner || admin) && (
                <IconButton label="Sil" className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => remove(c.id)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {items && items.length > 5 && (
        <button className="w-full border-t border-line py-2.5 text-xs text-muted hover:text-fg" onClick={() => setAll((a) => !a)}>
          {all ? "Daha az göster" : `Tümünü göster (${items.length})`}
        </button>
      )}
    </div>
  );
}

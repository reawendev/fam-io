"use client";

import { Check, Clock, Copy, Crown, Link2, Plus, Search, UserRound, UserX, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, cx, UserName } from "@/components/ui";
import { errMsg, sb } from "@/lib/supabase";
import type { Equipped, Room, RoomPlayer, RoomRole, SceneRole } from "@/lib/types";

type Person = { id: string; username: string; display_name: string; color: string; avatar_path: string | null; equipped?: Equipped };
type Invite = { id: string; to_user: string; from_user: string; created_at: string; to: Person | null };

const SPRING = { type: "spring", stiffness: 400, damping: 25 } as const;

/**
 * Lobideki oyuncular + davet (Member Selector tasarımı):
 * odadakiler renkli, bağlantısı kopanlar ve davet edilip henüz gelmeyenler gri; "+" ile site üyelerini ara ve davet et.
 * Bir avatara tıklayınca: profil, oda sahibine "sahip yap / çıkar", davetliye "daveti geri çek".
 */
export default function RoomMembers({
  room,
  me,
  players,
  assignments,
  roles,
  isHost,
  busy,
  onKick,
  onMakeHost,
}: {
  room: Room;
  me: string;
  players: RoomPlayer[];
  assignments: RoomRole[];
  roles: SceneRole[];
  isHost: boolean;
  busy: boolean;
  onKick: (uid: string) => void;
  onMakeHost: (uid: string) => void;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canInvite = room.status === "lobby";

  // Davetler (bekleyenler) — canlı
  const loadInvites = useCallback(async () => {
    const { data, error } = await sb()
      .from("room_invites")
      .select("id, to_user, from_user, created_at, to:profiles!room_invites_to_user_fkey(id, username, display_name, color, avatar_path, equipped)")
      .eq("room_id", room.id)
      .eq("status", "bekliyor")
      .order("created_at");
    if (!error) setInvites((data as unknown as Invite[]) ?? []);
  }, [room.id]);
  useEffect(() => {
    loadInvites();
    const ch = sb()
      .channel(`room-invites:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_invites", filter: `room_id=eq.${room.id}` }, () => loadInvites())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [room.id, loadInvites]);
  // Oyuncu listesi değişince (davetli katıldı) tazele
  useEffect(() => {
    loadInvites();
  }, [players.length, loadInvites]);

  // Dışarı tıklayınca kapat
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenu(null);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Davet listesi için site üyeleri (ilk açılışta)
  useEffect(() => {
    if (!open || people) return;
    sb()
      .from("profiles")
      .select("id, username, display_name, color, avatar_path, equipped")
      .order("display_name")
      .limit(300)
      .then(({ data }) => setPeople((data as Person[]) ?? []));
  }, [open, people]);

  const inRoom = useMemo(() => new Set(players.map((p) => p.user_id)), [players]);
  const invitedIds = useMemo(() => new Set(invites.map((i) => i.to_user)), [invites]);
  const shownInvites = invites.filter((i) => !inRoom.has(i.to_user) && i.to);
  const rolesOf = (uid: string) =>
    assignments
      .filter((a) => a.user_id === uid)
      .map((a) => roles.find((r) => r.id === a.role_id))
      .filter(Boolean) as SceneRole[];

  async function toggleInvite(p: Person) {
    if (inRoom.has(p.id) || pending) return;
    setPending(p.id);
    setMsg(null);
    const invited = invitedIds.has(p.id);
    const { error } = invited
      ? await sb().rpc("cancel_invite", { p_room: room.id, p_user: p.id })
      : await sb().rpc("invite_to_room", { p_room: room.id, p_users: [p.id] });
    setPending(null);
    if (error) setMsg(errMsg(error));
    else loadInvites();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/oda/${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    return (people ?? [])
      .filter((p) => p.id !== me && (!s || p.display_name.toLocaleLowerCase("tr").includes(s) || p.username.includes(s)))
      .sort((a, b) => rank(a.id) - rank(b.id));
    function rank(id: string) {
      return invitedIds.has(id) ? 0 : inRoom.has(id) ? 2 : 1;
    }
  }, [people, q, me, invitedIds, inRoom]);

  return (
    <div ref={boxRef} className="relative p-4">
      <LayoutGroup>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
          {players.map((p) => {
            const offline = p.online === false;
            const host = p.user_id === room.host_id;
            const rs = rolesOf(p.user_id);
            return (
              <div key={p.user_id} className="relative">
                <motion.button
                  layoutId={`member-${p.user_id}`}
                  onClick={() => setMenu(menu === p.user_id ? null : p.user_id)}
                  className="group relative flex w-[60px] cursor-pointer flex-col items-center gap-1.5 outline-none"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING}
                  title={offline ? `${p.nickname} · bağlantı yok` : p.nickname}
                >
                  <span
                    className={cx(
                      "relative rounded-full transition-all duration-200 group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface",
                      offline && "opacity-45 grayscale",
                    )}
                  >
                    <Avatar name={p.nickname} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} size={48} />
                  </span>
                  {host && (
                    <span className="absolute -top-1 -right-0.5 z-10 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm ring-2 ring-surface" aria-label="Oda sahibi">
                      <Crown className="size-3" strokeWidth={2.5} />
                    </span>
                  )}
                  <span
                    className={cx("absolute right-1 bottom-[22px] z-10 size-3 rounded-full ring-2 ring-surface", offline ? "bg-muted" : "bg-ok")}
                    aria-label={offline ? "Bağlantı yok" : "Çevrimiçi"}
                  />
                  <motion.span
                    layoutId={`member-name-${p.user_id}`}
                    className={cx("block max-w-[60px] truncate text-xs font-medium transition-colors", offline ? "text-muted" : "text-fg")}
                  >
                    {p.user_id === me ? "Sen" : p.nickname.split(" ")[0]}
                  </motion.span>
                  {rs.length > 0 && (
                    <span className="-mt-1 flex gap-0.5">
                      {rs.slice(0, 4).map((r) => (
                        <span key={r.id} className="size-1.5 rounded-full" style={{ background: r.color }} title={r.name} />
                      ))}
                    </span>
                  )}
                </motion.button>

                <AnimatePresence>
                  {menu === p.user_id && (
                    <MenuPop>
                      <p className="truncate px-2.5 pt-1.5 pb-1 text-xs">
                        <UserName name={p.nickname} fx={p.equipped?.name} className="font-medium" />
                        {offline && <span className="block text-[11px] text-muted">Bağlantı yok · birazdan düşer</span>}
                        {rs.length > 0 && <span className="block truncate text-[11px] text-muted">{rs.map((r) => r.name).join(", ")}</span>}
                      </p>
                      {p.username && (
                        <MenuItem href={`/u/${p.username}`} icon={<UserRound />}>
                          Profili gör
                        </MenuItem>
                      )}
                      {isHost && p.user_id !== me && (
                        <>
                          <MenuItem icon={<Crown />} disabled={busy} onClick={() => (setMenu(null), onMakeHost(p.user_id))}>
                            Oda sahibi yap
                          </MenuItem>
                          <MenuItem icon={<UserX />} danger disabled={busy} onClick={() => (setMenu(null), onKick(p.user_id))}>
                            Odadan çıkar
                          </MenuItem>
                        </>
                      )}
                    </MenuPop>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Davet edilen, henüz gelmeyenler */}
          <AnimatePresence>
            {shownInvites.map((i) => (
              <motion.div
                key={i.id}
                className="relative"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={SPRING}
              >
                <motion.button
                  layoutId={`member-${i.to_user}`}
                  onClick={() => setMenu(menu === i.id ? null : i.id)}
                  className="group relative flex w-[60px] cursor-pointer flex-col items-center gap-1.5 outline-none"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING}
                  title={`${i.to!.display_name} · davet edildi`}
                >
                  <span className="rounded-full p-[2px] opacity-55 grayscale outline-2 outline-offset-0 outline-line-strong outline-dashed transition-all group-hover:opacity-80">
                    <Avatar name={i.to!.display_name} color={i.to!.color} path={i.to!.avatar_path} size={44} />
                  </span>
                  <span className="absolute right-0 bottom-5 z-10 flex size-4 items-center justify-center rounded-full bg-fg text-bg shadow-sm">
                    <Clock className="size-2.5" strokeWidth={2.5} />
                  </span>
                  <motion.span layoutId={`member-name-${i.to_user}`} className="block max-w-[60px] truncate text-xs font-medium text-muted">
                    {i.to!.display_name.split(" ")[0]}
                  </motion.span>
                </motion.button>
                <AnimatePresence>
                  {menu === i.id && (
                    <MenuPop>
                      <p className="px-2.5 pt-1.5 pb-1 text-xs">
                        <span className="font-medium">{i.to!.display_name}</span>
                        <span className="block text-[11px] text-muted">Davet edildi, cevap bekleniyor</span>
                      </p>
                      {(i.from_user === me || isHost) && (
                        <MenuItem icon={<X />} danger onClick={() => (setMenu(null), toggleInvite(i.to!))}>
                          Daveti geri çek
                        </MenuItem>
                      )}
                    </MenuPop>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Davet et */}
          {canInvite && (
            <motion.button
              onClick={() => {
                setOpen(!open);
                setMenu(null);
              }}
              className="group flex w-[60px] cursor-pointer flex-col items-center gap-1.5 outline-none"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-expanded={open}
            >
              <span
                className={cx(
                  "flex size-12 items-center justify-center rounded-full border-2 border-dashed transition-all duration-200 group-focus-visible:ring-2 group-focus-visible:ring-accent",
                  open ? "border-accent bg-accent/10" : "border-muted/50 hover:border-muted hover:bg-surface-2",
                )}
              >
                <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
                  <Plus className={cx("size-5 transition-colors", open ? "text-accent" : "text-muted")} />
                </motion.span>
              </span>
              <span className={cx("text-xs font-medium transition-colors", open ? "text-accent" : "text-muted")}>Davet et</span>
            </motion.button>
          )}
        </div>
      </LayoutGroup>

      {/* Üye arama + davet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-x-3 top-full z-40 -mt-1 overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-2xl shadow-black/50"
          >
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Üye ara…"
                  className="w-full rounded-lg border border-transparent bg-bg/60 py-2 pr-3 pl-9 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:bg-bg"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted/30">
              {people === null ? (
                <p className="px-3 py-8 text-center text-sm text-muted">Yükleniyor…</p>
              ) : list.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted">Üye bulunamadı</p>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {list.map((p, idx) => {
                    const here = inRoom.has(p.id);
                    const inv = invitedIds.has(p.id);
                    return (
                      <motion.button
                        key={p.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: Math.min(idx, 12) * 0.02, duration: 0.15 }}
                        onClick={() => toggleInvite(p)}
                        disabled={here || pending === p.id}
                        className={cx(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-default",
                          inv ? "bg-accent/5 hover:bg-accent/10" : here ? "opacity-60" : "hover:bg-surface-3",
                        )}
                      >
                        <span className={cx("shrink-0 transition-all duration-200", !inv && !here && "opacity-60 grayscale")}>
                          <Avatar name={p.display_name} color={p.color} path={p.avatar_path} size={36} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            <UserName name={p.display_name} fx={p.equipped?.name} />
                          </span>
                          <span className="block truncate text-xs text-muted">
                            @{p.username}
                            {here ? " · odada" : inv ? " · davet edildi" : ""}
                          </span>
                        </span>
                        <span
                          className={cx(
                            "flex size-5 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                            inv || here ? "bg-accent" : "border-2 border-muted/40",
                          )}
                        >
                          {(inv || here) && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
                              <Check className="size-3 text-accent-fg" strokeWidth={3} />
                            </motion.span>
                          )}
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
              <span className="text-[11px] text-muted">Davet edilen bildirim alır, tek tıkla katılır.</span>
              <button className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg" onClick={copyLink}>
                {copied ? <Check className="size-3.5 text-ok" /> : <Link2 className="size-3.5" />}
                {copied ? "Kopyalandı" : "Linki kopyala"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {msg && <p className="mt-3 text-xs text-red-300">{msg}</p>}
      {!canInvite && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted"><Copy className="size-3" /> Oyun başladı; davetler lobide gönderilir.</p>}
    </div>
  );
}

function MenuPop({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full left-1/2 z-40 mt-1 w-48 -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-1 shadow-xl shadow-black/50"
    >
      {children}
    </motion.div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  href,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const cls = cx(
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:text-muted",
    danger ? "text-red-300 hover:bg-red-500/10 [&_svg]:text-red-300" : "hover:bg-surface-3",
  );
  if (href)
    return (
      <Link href={href} className={cls} target="_blank">
        {icon}
        {children}
      </Link>
    );
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

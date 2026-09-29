"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useNick } from "@/lib/nickname";
import { Avatar, cx, Logo } from "./ui";

const NAV = [
  { href: "/sahneler", label: "Sahneler" },
  { href: "/sahneler/yeni", label: "Sahne yükle" },
];

export default function SiteHeader() {
  const path = usePathname();
  const [nick, setNick] = useNick();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Oda içinde kayıt ekranında dikkati dağıtmamak için sadeleştir
  const inRoom = path.startsWith("/oda/");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-sm supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-[15px]" aria-label="fam-io ana sayfa">
          <Logo />
        </Link>
        {!inRoom && (
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => {
              const active = n.href === "/sahneler" ? path === "/sahneler" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                    active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) setNick(draft.trim());
                setEditing(false);
              }}
            >
              <input
                ref={inputRef}
                className="field h-8 w-40 text-[13px]"
                value={draft}
                maxLength={30}
                placeholder="Takma adın"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft.trim()) setNick(draft.trim());
                  setEditing(false);
                }}
              />
            </form>
          ) : (
            <button
              className="group flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
              onClick={() => {
                setDraft(nick);
                setEditing(true);
              }}
              title="Takma adını değiştir"
            >
              {nick ? <Avatar name={nick} size={22} /> : null}
              <span className="max-w-32 truncate">{nick || "Takma ad belirle"}</span>
              <Pencil className="size-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

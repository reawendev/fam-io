"use client";

import type { User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { sb } from "./supabase";
import type { Profile } from "./types";

/**
 * Kullanıcı adı + şifre ile giriş. Supabase e-posta istediği için kullanıcı adından
 * görünmeyen bir adres üretilir (hiç e-posta gönderilmez; Supabase'de "Confirm email" kapalı olmalı).
 */
export const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "users.fam-io.app";
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const normUsername = (u: string) => u.trim().toLocaleLowerCase("en");
const usernameEmail = (u: string) => `${normUsername(u)}@${EMAIL_DOMAIN}`;

function authError(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "Kullanıcı adı veya şifre yanlış.";
  if (/already registered|already exists/i.test(msg)) return "Bu kullanıcı adı alınmış.";
  if (/password should be at least|weak password/i.test(msg)) return "Şifre en az 6 karakter olmalı.";
  if (/database error saving new user/i.test(msg)) return "Bu kullanıcı adı alınmış ya da geçersiz.";
  if (/signups not allowed|signup.*disabled/i.test(msg)) return "Supabase'de yeni kayıtlar kapalı (Authentication > Sign In / Providers > Allow new users to sign up).";
  if (/email.*not.*confirmed/i.test(msg)) return "Supabase'de 'Confirm email' kapalı olmalı.";
  if (/rate limit/i.test(msg)) return "Çok fazla deneme yapıldı, biraz bekle.";
  return msg;
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await sb().rpc("username_available", { p_username: normUsername(username) });
  if (error) throw error;
  return !!data;
}

export async function signUp(username: string, password: string, displayName: string) {
  const u = normUsername(username);
  if (!USERNAME_RE.test(u)) throw new Error("Kullanıcı adı 3–20 karakter olmalı: küçük harf, rakam, _ ve . kullanılabilir.");
  const { data: current } = await sb().auth.getSession();
  if (current.session?.user?.is_anonymous) await sb().auth.signOut();
  const { data, error } = await sb().auth.signUp({
    email: usernameEmail(u),
    password,
    options: { data: { username: u, display_name: displayName.trim() || u } },
  });
  if (error) throw new Error(authError(error.message));
  if (!data.session) {
    throw new Error("Hesap oluştu ama oturum açılmadı. Supabase'de Authentication > Sign In / Providers > Email > 'Confirm email' kapalı olmalı.");
  }
  await refreshMe();
}

export async function signIn(username: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email: usernameEmail(username), password });
  if (error) throw new Error(authError(error.message));
  await refreshMe();
}

export async function signOut() {
  await sb().auth.signOut();
  await refreshMe();
}

// ------------------------------------------------------------
// Oturum + profil store'u (tüm sayfalarda tek kaynak)
// ------------------------------------------------------------
export type MeState =
  | { status: "loading"; user: null; profile: null }
  | { status: "out"; user: null; profile: null }
  | { status: "in"; user: User; profile: Profile };

const LOADING: MeState = { status: "loading", user: null, profile: null };
const OUT: MeState = { status: "out", user: null, profile: null };
let state: MeState = LOADING;
const listeners = new Set<() => void>();
let started = false;

function set(s: MeState) {
  state = s;
  listeners.forEach((l) => l());
}

async function load(user: User | null | undefined) {
  if (!user || user.is_anonymous) return set(OUT);
  const { data } = await sb().from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return set(OUT);
  set({ status: "in", user, profile: data as Profile });
}

export async function refreshMe() {
  const { data } = await sb().auth.getSession();
  await load(data.session?.user);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  refreshMe().catch(() => set(OUT));
  sb().auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") set(OUT);
    else if (event === "SIGNED_IN" || event === "USER_UPDATED") load(session?.user).catch(() => {});
  });
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMe(): MeState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

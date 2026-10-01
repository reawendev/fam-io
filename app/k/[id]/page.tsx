import type { Metadata } from "next";
import PhoneGameView from "@/components/PhoneGameView";

type Meta = { created_at: string; players: number };

async function fetchMeta(id: string): Promise<Meta | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(`${url}/rest/v1/phone_games?id=eq.${id}&select=created_at,players`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Meta[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await fetchMeta(id);
  const title = "Kulaktan kulağa";
  const description = m
    ? `${m.players} kişi bir cümleyi ağızdan ağıza dolaştırdı. Sonunda ne oldu, dinle.`
    : "Bir cümle ağızdan ağıza dolaştı. Sonunda ne oldu, dinle.";
  return { title, description, openGraph: { title, description, siteName: "fam-io" } };
}

export default async function KulakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PhoneGameView id={id} />;
}

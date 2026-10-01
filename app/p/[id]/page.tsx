import type { Metadata } from "next";
import PartyGameView from "@/components/PartyGameView";

const NAMES: Record<string, string> = { kim: "Kim konuştu?", efekt: "Efekt yarışması", duygu: "Duygu ruleti", hikaye: "Sesli hikâye" };

async function fetchMeta(id: string): Promise<{ kind: string; players: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(`${url}/rest/v1/party_games?id=eq.${id}&select=kind,players`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { kind: string; players: number }[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await fetchMeta(id);
  const title = m ? NAMES[m.kind] ?? "Parti oyunu" : "Parti oyunu";
  const description = m?.kind === "hikaye" ? `${m.players} kişi sırayla bir hikâye anlattı. Baştan sona dinle.` : `${m?.players ?? "Birkaç"} kişi fam-io'da ${title} oynadı. Sonuçlara bak.`;
  return { title, description, openGraph: { title, description, siteName: "fam-io" } };
}

export default async function PartiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartyGameView id={id} />;
}

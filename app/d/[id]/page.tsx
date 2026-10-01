import type { Metadata } from "next";
import DubView from "@/components/DubView";

type Meta = { created_at: string; scenes: { title: string } | null; dub_participants: { profiles: { display_name: string } | null }[] };

async function fetchMeta(id: string): Promise<Meta | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/dubs?id=eq.${id}&select=created_at,scenes(title),dub_participants(profiles(display_name))`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 300 } },
    );
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
  if (!m) return { title: "Dublaj" };
  const names = m.dub_participants.map((p) => p.profiles?.display_name).filter(Boolean).join(", ");
  const title = `${m.scenes?.title ?? "Dublaj"} — ${names}`;
  const description = `${names} bu sahneyi fam-io'da seslendirdi. İzlemek için tıkla.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "video.other", siteName: "fam-io" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DubView id={id} />;
}

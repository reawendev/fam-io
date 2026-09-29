"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import SceneEditor from "@/components/SceneEditor";
import { ButtonLink, Notice, Spinner } from "@/components/ui";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import type { SceneFull } from "@/lib/types";

export default function SahneDuzenle() {
  const { id } = useParams<{ id: string }>();
  const [scene, setScene] = useState<SceneFull | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await ensureUser();
        const { data, error } = await sb().from("scenes").select("*, scene_roles(*), scene_lines(*)").eq("id", id).single();
        if (error) throw error;
        if (data.created_by !== u.id) throw new Error("Bu sahneyi sadece yükleyen kişi düzenleyebilir.");
        setScene(data as SceneFull);
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  }, [id]);

  if (error)
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
        <Notice>{error}</Notice>
        <ButtonLink href="/sahneler" size="sm" className="self-start">
          Sahnelere dön
        </ButtonLink>
      </main>
    );
  if (!scene)
    return (
      <main className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-20 text-sm text-muted sm:px-6">
        <Spinner /> Sahne yükleniyor
      </main>
    );
  return <SceneEditor initial={scene} />;
}

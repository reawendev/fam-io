"use client";

import { Circle, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MicWave from "./MicWave";
import { Button } from "./ui";

const MAX_SEC = 5;

/**
 * İmza sesi kaydedici: en fazla 5 saniye. Kaydı dinletir, onaylanınca onChange(blob) çağırır.
 * value: mevcut sesin adresi (varsa), onRemove: sesi kaldır.
 */
export default function VoiceRecorder({
  value,
  onChange,
  onRemove,
}: {
  value: string | null;
  onChange: (blob: Blob, ext: string) => void;
  onRemove: () => void;
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [left, setLeft] = useState(MAX_SEC);
  const [url, setUrl] = useState<string | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setUrl(value), [value]);
  useEffect(
    () => () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    },
    [stream],
  );

  async function start() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      setStream(s);
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      mrRef.current = mr;
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        setStream(null);
        if (timer.current) clearInterval(timer.current);
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 500) return setError("Ses alınamadı, tekrar dene.");
        const u = URL.createObjectURL(blob);
        setUrl(u);
        onChange(blob, (mr.mimeType || "").includes("mp4") ? "m4a" : "webm");
      };
      mr.start();
      setLeft(MAX_SEC);
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const l = MAX_SEC - (Date.now() - t0) / 1000;
        setLeft(Math.max(0, l));
        if (l <= 0 && mr.state === "recording") mr.stop();
      }, 100);
    } catch {
      setError("Mikrofon izni verilmedi.");
    }
  }

  function play() {
    if (!url) return;
    if (playing) {
      audioRef.current?.pause();
      return setPlaying(false);
    }
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => setPlaying(false);
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  const recording = !!stream;
  return (
    <div className="flex flex-col gap-2">
      {recording ? (
        <div className="flex items-center gap-3 rounded-lg border border-rec/40 bg-rec/[0.06] px-3 py-2">
          <span className="rec-dot size-2 rounded-full bg-rec" />
          <MicWave stream={stream} bars={24} className="h-6 flex-1" />
          <span className="w-8 text-right font-mono text-xs text-fg-2">{left.toFixed(1)}</span>
          <Button size="sm" variant="danger" icon={<Square className="size-3.5" />} type="button" onClick={() => mrRef.current?.stop()}>
            Bitir
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" variant="rec" icon={url ? <RotateCcw className="size-3.5" /> : <Circle className="size-3 fill-current" />} onClick={start}>
            {url ? "Yeniden kaydet" : "Kaydet (5 sn)"}
          </Button>
          {url && (
            <>
              <Button size="sm" type="button" icon={playing ? <Square className="size-3.5" /> : <Play className="size-3.5" />} onClick={play}>
                {playing ? "Durdur" : "Dinle"}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => {
                  setUrl(null);
                  onRemove();
                }}
              >
                Kaldır
              </Button>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

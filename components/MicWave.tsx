"use client";

import { useEffect, useRef } from "react";
import { audioCtx } from "@/lib/player";
import { cx } from "./ui";

/**
 * Mikrofondan canlı ses dalgası. Ses gelmiyorsa çizgi düz kalır; `onLevel`
 * her karede 0–1 arası tepe seviyesini bildirir (sessiz kayıt uyarısı için).
 */
export default function MicWave({
  stream,
  active = true,
  className,
  color = "#ef4444",
  bars = 48,
  onLevel,
}: {
  stream: MediaStream | null;
  active?: boolean;
  className?: string;
  color?: string;
  bars?: number;
  onLevel?: (peak: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onLevelRef = useRef(onLevel);
  useEffect(() => {
    onLevelRef.current = onLevel;
  }, [onLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream || !active) return;
    const ctx = audioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    let src: MediaStreamAudioSourceNode;
    try {
      src = ctx.createMediaStreamSource(stream);
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser); // hoparlöre bağlanmaz, geri besleme olmaz
    const data = new Float32Array(analyser.fftSize);
    const levels = new Array(bars).fill(0);
    const g = canvas.getContext("2d")!;
    let raf = 0;
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
        sum += data[i] * data[i];
      }
      const rms = Math.sqrt(sum / data.length);
      onLevelRef.current?.(peak);
      // Her ~2 karede bir yeni çubuk: soldan sağa akan seviye geçmişi
      if (frame++ % 2 === 0) {
        levels.shift();
        levels.push(Math.min(1, rms * 5.5));
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const gap = 2;
      const bw = Math.max(1.5, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        const v = levels[i];
        const bh = Math.max(2, v * h);
        g.globalAlpha = 0.35 + 0.65 * (i / bars);
        g.fillStyle = color;
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        g.beginPath();
        g.roundRect(x, y, bw, bh, bw / 2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      try {
        src.disconnect();
      } catch {}
    };
  }, [stream, active, bars, color]);

  return <canvas ref={canvasRef} className={cx("block h-8 w-full", className)} aria-hidden />;
}

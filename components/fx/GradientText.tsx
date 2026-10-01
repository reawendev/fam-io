"use client";

import React from "react";
import { motion, type MotionProps } from "motion/react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

interface GradientTextProps extends Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps> {
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
}

// motion.create her render'da yeni bileşen üretmesin diye önbellek
const cache = new Map<React.ElementType, React.ElementType>();
function motionOf(c: React.ElementType) {
  let m = cache.get(c);
  if (!m) {
    m = motion.create(c as string) as unknown as React.ElementType;
    cache.set(c, m);
  }
  return m;
}

/**
 * Yazının içinde gezinen renk lekeleri (21st.dev "Gradient Text" uyarlaması).
 * Orijinali leke katmanlarını "mix-blend" ile zemine karıştırıyor; bu, koyu ama tam siyah olmayan
 * panellerde yazının arkasında renkli bir kutu bırakıyordu. Burada aynı dört renk (--color-1..4)
 * yazıya kırpılmış hareketli radyal gradyanlarla çiziliyor: her zeminde sadece harfler renklenir.
 */
export function GradientText({ className, children, as: Component = "span", ...props }: GradientTextProps) {
  const MotionComponent = motionOf(Component);
  return (
    <MotionComponent className={cx("aurora-text", className)} {...props}>
      {children}
    </MotionComponent>
  );
}

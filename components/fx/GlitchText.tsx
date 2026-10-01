"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

interface GlitchTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  textClassName?: string;
  colors?: { red: string; green: string; blue: string };
}

/**
 * Titreyen RGB katmanlı yazı (21st.dev "Animated Glitch Text" uyarlaması).
 * İsim etiketi olarak satır içinde kullanılır: boyut ve kalınlık çevredeki yazıdan gelir.
 * Koyu temada katmanlar "screen" ile birleşir; hareket azaltma açıksa sabit durur.
 */
export const GlitchText = React.forwardRef<HTMLSpanElement, GlitchTextProps>(
  ({ text, className, textClassName, colors = { red: "#ff3b3b", green: "#3bff7a", blue: "#4d7cff" }, ...props }, ref) => {
    const reduce = useReducedMotion();
    const layer = cx("block whitespace-nowrap mix-blend-screen", textClassName);
    return (
      <span ref={ref} className={cx("relative inline-block align-bottom", className)} {...props}>
        <span className="sr-only">{text}</span>
        <motion.span
          aria-hidden
          className={cx(layer, "absolute inset-0")}
          style={{ color: colors.red }}
          animate={reduce ? undefined : { x: [-2, 2, -2], y: [0, -1, 1], skewX: [0, -2, 2], opacity: [1, 0.8, 0.9] }}
          transition={{ duration: 0.15, repeat: Infinity, repeatType: "mirror", ease: "anticipate" }}
        >
          {text}
        </motion.span>
        <motion.span
          aria-hidden
          className={cx(layer, "absolute inset-0")}
          style={{ color: colors.green }}
          animate={reduce ? undefined : { x: [2, -2, 2], y: [1, -1, 0], skewX: [-2, 2, 0], opacity: [0.9, 1, 0.8] }}
          transition={{ duration: 0.13, repeat: Infinity, repeatType: "mirror", ease: "anticipate" }}
        >
          {text}
        </motion.span>
        <motion.span
          aria-hidden
          className={layer}
          style={{ color: colors.blue }}
          animate={reduce ? undefined : { x: [-1, 1, -1], y: [-1, 1, 0], skewX: [2, -2, 0], opacity: [0.8, 0.9, 1] }}
          transition={{ duration: 0.11, repeat: Infinity, repeatType: "mirror", ease: "anticipate" }}
        >
          {text}
        </motion.span>
      </span>
    );
  },
);
GlitchText.displayName = "GlitchText";

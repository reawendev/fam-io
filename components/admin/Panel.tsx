"use client";

import { cx } from "@/components/ui";

export function Panel({
  icon,
  title,
  right,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("panel", className)}>
      <div className="panel-head">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted">{icon}</span>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export type Msg = { tone: "info" | "error"; text: string } | null;

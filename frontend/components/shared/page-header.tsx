"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("page-title-portal"));
  }, []);

  const portalContent = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <h2 className="truncate text-base font-black tracking-tight text-slate-800 lg:text-lg">{title}</h2>
      {description ? (
        <>
          <div className="h-4 w-px shrink-0 bg-slate-300 hidden md:block"></div>
          <p className="hidden flex-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate lg:block" title={description}>
            {description}
          </p>
        </>
      ) : null}
    </div>
  );

  return (
    <>
      {target ? createPortal(portalContent, target) : null}
      {children ? <div className={cn("flex w-full shrink-0 items-center justify-between gap-3 mb-4", className)}>{children}</div> : null}
    </>
  );
}

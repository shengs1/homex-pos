import type * as React from "react";
import { cn } from "@/lib/utils";

type DataTableProps = {
  children: React.ReactNode;
  className?: string;
  tableClassName?: string;
  noHorizontalScroll?: boolean;
};

export function DataTable({ children, className, tableClassName, noHorizontalScroll = false }: DataTableProps) {
  return (
    <div
      className={cn(
        "relative w-full min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm [&_tbody_tr:hover]:bg-slate-50",
        noHorizontalScroll ? "overflow-visible" : "overflow-x-auto",
        className
      )}
    >
      <table className={cn("w-full border-collapse text-sm text-slate-700", noHorizontalScroll ? "table-fixed" : "min-w-[760px] lg:min-w-[920px]", tableClassName)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: DataTableProps) {
  return <th className={cn("min-w-0 border-b border-slate-100 px-3 py-3 text-left align-middle text-[9px] font-black uppercase tracking-wider text-slate-400 lg:px-4 lg:py-3.5", className)}>{children}</th>;
}

export function Td({ children, className }: DataTableProps) {
  return <td className={cn("min-w-0 border-b border-slate-100 px-3 py-2.5 align-middle text-xs text-slate-700 lg:px-4 lg:py-3", className)}>{children}</td>;
}

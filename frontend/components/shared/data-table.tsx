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
        "relative z-0 w-full min-w-0 rounded-xl border bg-card shadow-sm",
        noHorizontalScroll ? "overflow-visible" : "overflow-x-auto overflow-y-visible",
        className
      )}
    >
      <table className={cn("w-full border-collapse text-sm", noHorizontalScroll ? "table-fixed" : "min-w-[980px]", tableClassName)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: DataTableProps) {
  return <th className={cn("border-b bg-muted/40 px-4 py-3 text-left align-middle font-semibold text-foreground", className)}>{children}</th>;
}

export function Td({ children, className }: DataTableProps) {
  return <td className={cn("border-t px-4 py-3 align-middle", className)}>{children}</td>;
}

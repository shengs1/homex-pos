"use client";

import type { Table as TanStackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { EmptyState, LoadingState } from "@/components/shared/message-state";
import { cn } from "@/lib/utils";

type ColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
};

type TanStackDataTableProps<TData> = {
  table: TanStackTable<TData>;
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  tableClassName?: string;
};

function getColumnMeta(columnDef: { meta?: unknown }): ColumnMeta {
  return (columnDef.meta || {}) as ColumnMeta;
}

export function TanStackDataTable<TData>({
  table,
  isLoading = false,
  emptyMessage,
  className,
  tableClassName,
}: TanStackDataTableProps<TData>) {
  if (isLoading) return <LoadingState />;

  if (table.getRowModel().rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className={cn("relative z-0 w-full min-w-0 overflow-visible rounded-xl border bg-card shadow-sm", className)}>
      <table className={cn("w-full table-fixed border-collapse text-sm", tableClassName)}>
        <colgroup>
          {table.getAllLeafColumns().map((column) => (
            <col key={column.id} style={{ width: `${column.getSize()}px` }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = getColumnMeta(header.column.columnDef);
                return (
                  <th
                    key={header.id}
                    className={cn(
                      "border-b bg-muted/40 px-3 py-3 text-left align-middle font-semibold text-foreground",
                      meta.headerClassName
                    )}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-muted/30">
              {row.getVisibleCells().map((cell) => {
                const meta = getColumnMeta(cell.column.columnDef);
                return (
                  <td key={cell.id} className={cn("border-t px-3 py-3 align-middle", meta.cellClassName)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

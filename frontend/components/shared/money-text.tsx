import { formatNumber } from "@/lib/format";

export function MoneyText({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`whitespace-nowrap font-semibold text-slate-950 ${className}`}>
      {formatNumber(value)}
      <span className="ml-1 text-xs font-medium text-slate-400">VND</span>
    </span>
  );
}

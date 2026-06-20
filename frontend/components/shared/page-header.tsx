import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-xl font-black tracking-tight text-slate-800">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-xs font-semibold uppercase tracking-wider text-slate-500 line-clamp-2">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

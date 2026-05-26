// Small presentational helpers shared across admin tabs.
import { forwardRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Kpi({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "green" | "amber" | "red" | "default"; icon?: React.ReactNode }) {
  const accent = tone === "green" ? "text-primary" : tone === "amber" ? "text-amber-400" : tone === "red" ? "text-destructive" : "text-foreground";
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <div className={cn("font-display text-2xl font-bold mt-1.5", accent)}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  if (status === "success") return <span className="inline-flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" />success</span>;
  if (status === "running") return <span className="inline-flex items-center gap-1 text-xs text-amber-400"><Clock className="h-3 w-3" />running</span>;
  if (status === "error" || status === "failed") return <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3 w-3" />{status}</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3" />{status}</span>;
}

export function RolePill({ role }: { role: string }) {
  const tone =
    role === "super_admin" ? "bg-purple-700/30 text-purple-300 border-purple-700/50" :
    role === "account_admin" ? "bg-primary/20 text-primary border-primary/40" :
    "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider font-bold", tone)}>{role.replace("_", " ")}</Badge>;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-5" />)}
        </div>
      ))}
    </div>
  );
}

export const EmptyState = forwardRef<HTMLDivElement, { children: React.ReactNode }>(({ children }, ref) => (
  <div ref={ref} className="text-sm text-muted-foreground p-8 text-center">{children}</div>
));
EmptyState.displayName = "EmptyState";

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm rounded-md p-3 mb-4">
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function balanceClass(cents: number) {
  if (cents <= 0) return "text-destructive";
  if (cents < 500) return "text-amber-400";
  return "text-primary";
}

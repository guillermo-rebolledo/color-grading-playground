import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** One panel in the bottom dock: a title strip that always stays, and a body
 * that the strip's toggle hides and restores. A collapsed panel is the strip
 * alone, so collapsing is never a one-way door. */
export function DockPanel({
  id,
  title,
  icon,
  label,
  meta,
  collapsed,
  onToggle,
  className,
  children,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  label: string;
  meta?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  className: string;
  children: ReactNode;
}) {
  const action = collapsed ? "Expand" : "Collapse";
  return (
    <section
      className={`dock-panel flex min-h-0 min-w-0 flex-col overflow-hidden bg-card ${className}`}
      aria-label={label}
      data-collapsed={collapsed ? "" : undefined}
    >
      <div
        className={`dock-strip flex shrink-0 items-center gap-3 border-b border-border px-3 text-[11px] text-muted-foreground ${collapsed ? "h-[var(--strip-height)]" : "h-7"}`}
      >
        <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          {icon}
          {title}
        </h2>
        {meta}
        <Button
          size="toolbar"
          type="button"
          className="dock-toggle ml-auto"
          aria-label={`${action} ${title.toLowerCase()} panel`}
          aria-expanded={!collapsed}
          aria-controls={id}
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
          )}
          {action}
        </Button>
      </div>
      <div
        className="dock-panel-body flex min-h-0 flex-1 flex-col overflow-auto"
        id={id}
        hidden={collapsed}
      >
        {children}
      </div>
    </section>
  );
}

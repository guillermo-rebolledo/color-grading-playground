import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** One panel in the bottom dock: a title strip that always stays, and a body
 * that the strip's toggle hides and restores. A collapsed panel is the strip
 * alone, so collapsing is never a one-way door. */
export function DockPanel({
  id,
  title,
  label,
  meta,
  collapsed,
  onToggle,
  className,
  children,
}: {
  id: string;
  title: string;
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
      className={`dock-panel ${className}`}
      aria-label={label}
      data-collapsed={collapsed ? "" : undefined}
    >
      <div className="panel-bar dock-strip">
        <h2>{title}</h2>
        {meta}
        <button
          type="button"
          className="dock-toggle"
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
        </button>
      </div>
      <div className="dock-panel-body" id={id} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

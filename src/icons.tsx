import {
  Activity,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardPaste,
  Columns2,
  Contrast,
  Copy,
  Download,
  Droplet,
  FolderOpen,
  GitBranch,
  Images,
  Info,
  Link2,
  Maximize,
  Move,
  OctagonAlert,
  Plus,
  RefreshCw,
  Redo2,
  Ruler,
  Save,
  ScanEye,
  SlidersHorizontal,
  Spline,
  SquareDashed,
  Thermometer,
  Trash2,
  TriangleAlert,
  Undo2,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/* The whole iconography of the product: Lucide, 14px, stroke 1.5, and this set
 * and no other. Adding an icon here is a design decision, not an
 * implementation one.
 *
 * Every icon is decorative — it is always paired with a visible text label, so
 * it is hidden from assistive technology and the label carries the meaning.
 * The one exception the design allows is the zoom cluster, whose icons are
 * conventional enough to stand alone; a caller there passes its own
 * `aria-label` and this wrapper steps out of the way. */
function fixed(Glyph: LucideIcon) {
  return function Icon({ "aria-label": label, ...props }: LucideProps) {
    return (
      <Glyph
        size={14}
        strokeWidth={1.5}
        aria-label={label}
        aria-hidden={label ? undefined : "true"}
        {...props}
      />
    );
  };
}

export const Icon = {
  Activity: fixed(Activity),
  ChevronDown: fixed(ChevronDown),
  ChevronRight: fixed(ChevronRight),
  Circle: fixed(Circle),
  ClipboardPaste: fixed(ClipboardPaste),
  Columns2: fixed(Columns2),
  Contrast: fixed(Contrast),
  Copy: fixed(Copy),
  Download: fixed(Download),
  Droplet: fixed(Droplet),
  FolderOpen: fixed(FolderOpen),
  GitBranch: fixed(GitBranch),
  Images: fixed(Images),
  Info: fixed(Info),
  Link2: fixed(Link2),
  Maximize: fixed(Maximize),
  Move: fixed(Move),
  OctagonAlert: fixed(OctagonAlert),
  Plus: fixed(Plus),
  Redo2: fixed(Redo2),
  RefreshCw: fixed(RefreshCw),
  Ruler: fixed(Ruler),
  Save: fixed(Save),
  ScanEye: fixed(ScanEye),
  SlidersHorizontal: fixed(SlidersHorizontal),
  Spline: fixed(Spline),
  SquareDashed: fixed(SquareDashed),
  Thermometer: fixed(Thermometer),
  Trash2: fixed(Trash2),
  TriangleAlert: fixed(TriangleAlert),
  Undo2: fixed(Undo2),
  WifiOff: fixed(WifiOff),
  X: fixed(X),
  ZoomIn: fixed(ZoomIn),
  ZoomOut: fixed(ZoomOut),
};

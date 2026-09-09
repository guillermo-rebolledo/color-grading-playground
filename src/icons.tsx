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
  Film,
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
function atFixedSize(Glyph: LucideIcon) {
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
  Activity: atFixedSize(Activity),
  ChevronDown: atFixedSize(ChevronDown),
  ChevronRight: atFixedSize(ChevronRight),
  Circle: atFixedSize(Circle),
  ClipboardPaste: atFixedSize(ClipboardPaste),
  Columns2: atFixedSize(Columns2),
  Contrast: atFixedSize(Contrast),
  Copy: atFixedSize(Copy),
  Download: atFixedSize(Download),
  Droplet: atFixedSize(Droplet),
  Film: atFixedSize(Film),
  FolderOpen: atFixedSize(FolderOpen),
  GitBranch: atFixedSize(GitBranch),
  Images: atFixedSize(Images),
  Info: atFixedSize(Info),
  Link2: atFixedSize(Link2),
  Maximize: atFixedSize(Maximize),
  Move: atFixedSize(Move),
  OctagonAlert: atFixedSize(OctagonAlert),
  Plus: atFixedSize(Plus),
  Redo2: atFixedSize(Redo2),
  RefreshCw: atFixedSize(RefreshCw),
  Ruler: atFixedSize(Ruler),
  Save: atFixedSize(Save),
  ScanEye: atFixedSize(ScanEye),
  SlidersHorizontal: atFixedSize(SlidersHorizontal),
  Spline: atFixedSize(Spline),
  SquareDashed: atFixedSize(SquareDashed),
  Thermometer: atFixedSize(Thermometer),
  Trash2: atFixedSize(Trash2),
  TriangleAlert: atFixedSize(TriangleAlert),
  Undo2: atFixedSize(Undo2),
  WifiOff: atFixedSize(WifiOff),
  X: atFixedSize(X),
  ZoomIn: atFixedSize(ZoomIn),
  ZoomOut: atFixedSize(ZoomOut),
};

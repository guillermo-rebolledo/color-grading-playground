/** The standing note on what a node-based grade can represent. */
export function AppFooter() {
  return (
    <footer className="footer flex min-h-12 shrink-0 items-center gap-6 border-t border-border px-6 py-3 text-[10px] text-muted-foreground">
      <span className="whitespace-nowrap text-foreground">
        Colour, one pixel at a time.
      </span>
      <p>
        Every adjustment depends only on a pixel’s colour—the kind of change a
        3D LUT can represent.
      </p>
      <span className="ml-auto whitespace-nowrap font-mono text-[10px]">
        JPEG / PNG
      </span>
    </footer>
  );
}

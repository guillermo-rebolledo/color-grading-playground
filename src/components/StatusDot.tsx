/** The 5px dot that opens a standing status line in a bar.
 *
 * It is not decoration: it is the sentence beside it, said in the time it
 * takes to glance. Green when that sentence is good news, amber when it is a
 * caveat the colourist may need to act on. */
export function StatusDot({ tone }: { tone: "ok" | "warning" }) {
  return (
    <span
      aria-hidden="true"
      className={`size-[5px] flex-none rounded-full ${
        tone === "ok" ? "bg-ok" : "bg-warning"
      }`}
    />
  );
}

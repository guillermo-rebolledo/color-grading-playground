import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/* Generated from shadcn/ui and then overridden. A field is 20px tall and
 * monospaced, because the thing it usually holds is a number a colourist is
 * scrubbing: tabular figures keep the digits from shifting width as the value
 * changes, and 11px is the floor for numeric text.
 *
 *   value   56px, right-aligned — a parameter or measured value
 *   text    fills its column, left-aligned — a name or a link
 *
 * Colour and state come from src/controls.css, which gives every field the
 * recessed --input fill, the 2px radius and the four states. */
const inputVariants = cva(
  "min-w-0 font-mono text-[11px] tabular-nums outline-none",
  {
    variants: {
      field: {
        value: "h-5 w-14 px-[5px] text-right",
        text: "h-5 w-full px-[5px] text-left",
      },
    },
    defaultVariants: { field: "value" },
  },
);

function Input({
  className,
  field = "value",
  type,
  ...props
}: ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ field, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };

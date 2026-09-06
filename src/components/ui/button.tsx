import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/* Generated from shadcn/ui and then overridden: stock density is far too loose
 * for a grading tool, where a toolbar has to hold a dozen controls beside the
 * image without crowding it.
 *
 * One button, three heights, taken from the region heights in the spec:
 *
 *   body      24px — the topbar and anything in a panel body
 *   bar       22px — the project bar
 *   toolbar   20px — panel toolbars
 *
 * Colour is not here. Every state a button shows — default, hover,
 * focus-visible, pressed, disabled — is defined once in src/controls.css and
 * reaches this component through the cascade, including its 2px radius. The
 * only thing a caller may say about colour is that a button sits on the accent
 * fill, which is what `variant="accent"` marks. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-normal outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        body: "h-6 px-[9px] text-xs",
        bar: "h-[22px] px-2 text-[11.5px]",
        toolbar: "h-5 px-[7px] text-[11.5px]",
      },
      variant: {
        default: "",
        accent: "",
      },
    },
    defaultVariants: { size: "body", variant: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "body",
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-accent-surface={variant === "accent" ? "" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

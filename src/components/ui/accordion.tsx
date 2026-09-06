import { Accordion as AccordionPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { Icon } from "@/icons";
import { cn } from "@/lib/utils";

/* Generated from shadcn/ui and then overridden. A section header is a 24px
 * strip, the same height as an inspector row, so a collapsed section costs one
 * row rather than a heading's worth of padding.
 *
 * The chevron does not rotate. Rotation is an animation the motion budget does
 * not have room for, and two icons from the fixed set say the same thing
 * without moving: chevron-right closed, chevron-down open. What does animate is
 * the height of the content, for --motion-collapse; the keyframes live beside
 * the rest of the budget in src/controls.css. */
function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b border-border last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex h-6 flex-1 items-center gap-1.5 px-2 text-left text-[11px] font-medium outline-none",
          className,
        )}
        {...props}
      >
        <Icon.ChevronRight className="[[data-state=open]_&]:hidden" />
        <Icon.ChevronDown className="[[data-state=closed]_&]:hidden" />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-xs"
      {...props}
    >
      <div className={cn("px-2 pb-2", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

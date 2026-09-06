import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { Icon } from "@/icons";
import { cn } from "@/lib/utils";

/* Generated from shadcn/ui and then overridden, on the same terms as the
 * dialog: a hairline border in place of the shadow, square corners, and no
 * slide-in. The motion budget has room for hover, press and panel collapse,
 * and a sheet is none of those. */
function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-scrim", className)}
      {...props}
    />
  );
}

const sides = {
  right: "inset-y-0 right-0 h-full w-96 border-l",
  left: "inset-y-0 left-0 h-full w-96 border-r",
  top: "inset-x-0 top-0 h-auto border-b",
  bottom: "inset-x-0 bottom-0 h-auto border-t",
};

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sides;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-3 rounded-none border-border bg-card text-xs outline-none",
          sides[side],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          data-slot="sheet-close"
          aria-label="Close"
          className="absolute top-2 right-2 flex h-5 items-center justify-center gap-1 px-2"
        >
          <Icon.X />
          Close
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-3", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex items-center justify-end gap-2 p-3",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-[13px] leading-none font-medium", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};

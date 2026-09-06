import { Slider as SliderPrimitive } from "radix-ui";
import { useMemo, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/* Generated from shadcn/ui and then overridden. A slider lives in a 24px
 * inspector row between a 72px label and a 56px field, so it is drawn as thin
 * as it can be and still be grabbed: a 2px track with a 9px thumb. The thumb
 * is the one round thing in the interface — a handle, not a surface, and the
 * only shape the radius rule does not reach. Its shape and its states are
 * stated with the other controls, in src/controls.css. */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  const values = useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-[2px] w-full grow bg-line-strong"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-muted-foreground"
        />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="block size-[9px] shrink-0 outline-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };

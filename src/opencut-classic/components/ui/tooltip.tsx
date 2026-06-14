import { cva, type VariantProps } from "class-variance-authority";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/opencut-classic/utils/ui";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const tooltipVariants = cva(
  "z-50 overflow-visible rounded-sm text-sm shadow-md",
  {
    variants: {
      variant: {
        default:
          "border border-[#2b2c2f] bg-[#1b1c1f] px-3 py-1.5 text-[#d7d9dd]",
        destructive:
          "bg-destructive/10 text-destructive dark:bg-destructive/20 border-destructive [border-width:0.5px]",
        outline: "border-border",
        important:
          "border-[#b7ff00]/45 bg-[#1f2418] text-[#d8ff4f] [border-width:0.5px]",
        promotions:
          "bg-red-100/90 text-redb-900 dark:bg-red-900/20 dark:text-red-300 border-red-900 [border-width:0.5px]",
        personal:
          "bg-green-100/90 text-green-900 dark:bg-green-900/20 dark:text-green-300 border-green-900 [border-width:0.5px]",
        updates:
          "border-[#b7ff00]/45 bg-[#1f2418] text-[#d8ff4f] [border-width:0.5px]",
        forums:
          "border-[#b7ff00]/45 bg-[#1f2418] text-[#d8ff4f] [border-width:0.5px]",
        sidebar: "bg-white dark:bg-[#413F3E] p-2.5 flex flex-col gap-2",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface TooltipContentProps
  extends
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
    VariantProps<typeof tooltipVariants> {}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, variant, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(tooltipVariants({ variant }), className)}
    {...props}
  >
    {variant === "sidebar" && (
      <svg
        width="6"
        height="10"
        viewBox="0 0 6 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute top-1/2 left-[-6px] -translate-y-1/2"
        aria-hidden="true"
      >
        <path
          d="M6 0L0 5L6 10V0Z"
          className="fill-white/80 dark:fill-[#413F3E]"
        />
      </svg>
    )}
    {props.children}
  </TooltipPrimitive.Content>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

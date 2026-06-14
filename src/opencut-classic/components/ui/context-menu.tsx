"use client";

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/opencut-classic/utils/ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  ArrowRightIcon,
  CircleIcon,
} from "@hugeicons/core-free-icons";
import { useOverlayOpenChange } from "./use-overlay-open-change";

function ContextMenu({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const handleOpenChange = useOverlayOpenChange({
    onOpenChange,
  });
  return (
    <ContextMenuPrimitive.Root onOpenChange={handleOpenChange} {...props} />
  );
}

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuGroup = ContextMenuPrimitive.Group;

const ContextMenuPortal = ContextMenuPrimitive.Portal;

const ContextMenuSub = ContextMenuPrimitive.Sub;

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const contextMenuItemVariants = cva(
  "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-[#d7d9dd] outline-hidden data-disabled:pointer-events-none data-disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "focus:bg-[#2f3033] focus:text-white [&_svg]:text-[#8d929c]",
        destructive:
          "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
    variant?: VariantProps<typeof contextMenuItemVariants>["variant"];
    icon?: React.ReactNode;
  }
>(
  (
    { className, inset, children, variant = "default", icon, ...props },
    ref,
  ) => (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        contextMenuItemVariants({ variant }),
        "data-[state=open]:bg-[#2f3033] data-[state=open]:text-white",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {icon && <span className="size-4 shrink-0 text-[#8d929c]">{icon}</span>}
      {children}
      <HugeiconsIcon icon={ArrowRightIcon} className="ml-auto text-[#8d929c]" />
    </ContextMenuPrimitive.SubTrigger>
  ),
);
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-48 overflow-hidden rounded-md border border-[#2b2c2f] bg-[#1b1c1f] p-1 text-[#d7d9dd] shadow-[0_16px_40px_rgba(0,0,0,0.45)]",
      className,
    )}
    {...props}
  />
));
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(({ className, container, ...props }, ref) => (
  <ContextMenuPrimitive.Portal container={container ?? undefined}>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        "z-50 min-w-48 overflow-hidden rounded-md border border-[#2b2c2f] bg-[#1b1c1f] p-1 text-[#d7d9dd] shadow-[0_16px_40px_rgba(0,0,0,0.45)]",
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: VariantProps<typeof contextMenuItemVariants>["variant"];
    icon?: React.ReactNode;
    textRight?: string;
  }
>(
  (
    {
      className,
      inset,
      variant = "default",
      icon,
      children,
      textRight,
      ...props
    },
    ref,
  ) => {
    const shouldInsetContent = inset || Boolean(icon);

    return (
      <ContextMenuPrimitive.Item
        ref={ref}
        className={cn(
          contextMenuItemVariants({ variant }),
          shouldInsetContent && "pl-8",
          className,
        )}
        {...props}
      >
        {icon && (
          <span className="absolute left-3 flex size-3.5 items-center justify-center text-[#8d929c] [&_svg]:size-3.5 [&_svg]:shrink-0">
            {icon}
          </span>
        )}
        {children}
        {textRight && (
          <span className="mb-0.5 ml-auto text-[0.60rem] tracking-widest text-[#8d929c]">
            {textRight}
          </span>
        )}
      </ContextMenuPrimitive.Item>
    );
  },
);
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem> & {
    variant?: VariantProps<typeof contextMenuItemVariants>["variant"];
    icon?: React.ReactNode;
  }
>(
  (
    { className, children, checked, variant = "default", icon, ...props },
    ref,
  ) => (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        contextMenuItemVariants({ variant }),
        "pr-2 pl-8",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-3 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {icon && <span className="size-4 shrink-0 text-[#8d929c]">{icon}</span>}
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  ),
);
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem> & {
    variant?: VariantProps<typeof contextMenuItemVariants>["variant"];
    icon?: React.ReactNode;
  }
>(({ className, children, variant = "default", icon, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={cn(contextMenuItemVariants({ variant }), "pr-2 pl-8", className)}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <HugeiconsIcon icon={CircleIcon} className="size-2 fill-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {icon && <span className="size-4 shrink-0 text-[#8d929c]">{icon}</span>}
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
    icon?: React.ReactNode;
  }
>(({ className, inset, icon, children, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn(
      "flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-[#f0f1f3]",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {icon && <span className="size-4 shrink-0 text-[#8d929c]">{icon}</span>}
    {children}
  </ContextMenuPrimitive.Label>
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn("mx-1 my-1.5 h-px bg-[#2b2c2f]", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-[#8d929c]",
        className,
      )}
      {...props}
    />
  );
};
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};

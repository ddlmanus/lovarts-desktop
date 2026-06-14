"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/opencut-classic/components/ui/tooltip";
import { Button } from "@/opencut-classic/components/ui/button";
import { cn } from "@/opencut-classic/utils/ui";
import {
  TAB_KEYS,
  tabs,
  useAssetsPanelStore,
} from "@/opencut-classic/components/editor/panels/assets/assets-panel-store";

export function TabBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useAssetsPanelStore();
  const [showStartFade, setShowStartFade] = useState(false);
  const [showEndFade, setShowEndFade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkScrollPosition = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const { scrollLeft, scrollWidth, clientWidth } = element;
    setShowStartFade(scrollLeft > 0);
    setShowEndFade(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    checkScrollPosition();
    element.addEventListener("scroll", checkScrollPosition);

    const resizeObserver = new ResizeObserver(checkScrollPosition);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", checkScrollPosition);
      resizeObserver.disconnect();
    };
  }, [checkScrollPosition]);

  return (
    <div
      className={cn("relative flex h-full min-w-0 bg-background", className)}
    >
      <div
        ref={scrollRef}
        className="scrollbar-hidden relative flex size-full items-center gap-0.5 overflow-x-auto overflow-y-hidden px-1"
      >
        {TAB_KEYS.map((tabKey) => {
          const tab = tabs[tabKey];
          const label = t(`freeTools.mediaTrimmer.editor.tabs.${tabKey}`, {
            defaultValue: tab.label,
          });
          const isActive = activeTab === tabKey;
          return (
            <Tooltip key={tabKey} delayDuration={10}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label={label}
                  className={cn(
                    "group relative h-11 min-w-11 shrink-0 flex-col gap-0.5 rounded-[4px] px-1 py-1 text-[10px] leading-none",
                    "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                    isActive &&
                      "bg-secondary text-primary hover:bg-secondary hover:text-primary",
                  )}
                  onClick={() => setActiveTab(tabKey)}
                >
                  <tab.icon className="size-[1.15rem] shrink-0" />
                  <span className="max-w-11 truncate font-medium">{label}</span>
                  {isActive && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                variant="sidebar"
                sideOffset={6}
              >
                <div className="text-foreground text-sm leading-none font-medium">
                  {label}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <FadeOverlay direction="start" show={showStartFade} />
      <FadeOverlay direction="end" show={showEndFade} />
    </div>
  );
}

function FadeOverlay({
  direction,
  show,
}: {
  direction: "start" | "end";
  show: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 w-8 transition-opacity",
        show ? "opacity-100" : "opacity-0",
        direction === "start"
          ? "left-0 bg-gradient-to-r from-background to-transparent"
          : "right-0 bg-gradient-to-l from-background to-transparent",
      )}
    />
  );
}

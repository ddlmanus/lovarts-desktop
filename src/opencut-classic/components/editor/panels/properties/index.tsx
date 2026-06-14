"use client";

import { ScrollArea } from "@/opencut-classic/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { Button } from "@/opencut-classic/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/opencut-classic/components/ui/tooltip";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { useElementSelection } from "@/opencut-classic/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig } from "./registry";
import { cn } from "@/opencut-classic/utils/ui";
import { EmptyView } from "./empty-view";

export function PropertiesPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  useEditor((e) => e.scenes.getActiveSceneOrNull());
  useEditor((e) => e.media.getAssets());
  const { selectedElements } = useElementSelection();
  const { activeTabPerType, setActiveTab } = usePropertiesStore();

  if (selectedElements.length === 0) {
    return (
      <div className="panel lovarts-properties-panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-none border">
        <EmptyView />
      </div>
    );
  }

  if (selectedElements.length > 1) {
    return (
      <div className="panel lovarts-properties-panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-none border">
        <p className="text-muted-foreground text-sm">
          {t("freeTools.mediaTrimmer.editor.elementsSelected", {
            count: selectedElements.length,
          })}
        </p>
      </div>
    );
  }

  const mediaAssets = editor.media.getAssets();

  const elementsWithTracks = editor.timeline.getElementsWithTracks({
    elements: selectedElements,
  });
  const elementWithTrack = elementsWithTracks[0];

  if (!elementWithTrack) return null;

  const { element, track } = elementWithTrack;
  const config = getPropertiesConfig({ element, mediaAssets });
  const visibleTabs = config.tabs;

  const storedTabId = activeTabPerType[element.type];
  const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
  const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
  const activeTab =
    visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

  if (!activeTab) return null;
  const getTabLabel = (tab: (typeof visibleTabs)[number]) =>
    t(`freeTools.mediaTrimmer.editor.propertyTabs.${tab.id}`, {
      defaultValue: tab.label,
    });

  return (
    <div className="panel lovarts-properties-panel bg-background flex h-full flex-col overflow-hidden rounded-none border">
      <TooltipProvider delayDuration={0}>
        <div className="scrollbar-hidden flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-3">
          {visibleTabs.map((tab) => {
            const label = getTabLabel(tab);
            const isActive = tab.id === activeTab.id;
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setActiveTab({
                        elementType: element.type,
                        tabId: tab.id,
                      })
                    }
                    aria-label={label}
                    className={cn(
                      "relative h-9 shrink-0 rounded-none px-2.5 text-[13px] font-semibold",
                      "text-muted-foreground hover:bg-transparent hover:text-foreground",
                      isActive && "text-primary hover:text-primary",
                    )}
                  >
                    <span>{label}</span>
                    {isActive && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <ScrollArea className="flex-1 scrollbar-hidden">
        {activeTab.content({ trackId: track.id })}
      </ScrollArea>
    </div>
  );
}

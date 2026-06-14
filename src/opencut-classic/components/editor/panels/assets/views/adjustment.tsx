"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PanelView } from "@/opencut-classic/components/editor/panels/assets/views/base-panel";
import { Button } from "@/opencut-classic/components/ui/button";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { useElementSelection } from "@/opencut-classic/timeline/hooks/element/use-element-selection";
import type { BlendMode } from "@/opencut-classic/rendering";
import type { ParamValues } from "@/opencut-classic/params";
import type { TimelineElement } from "@/opencut-classic/timeline";
import { DEFAULT_GRAPHIC_SOURCE_SIZE } from "@/opencut-classic/graphics";
import type { TCanvasSize } from "@/opencut-classic/project/types";
import { cn } from "@/opencut-classic/utils/ui";

type AdjustmentPreset = {
  key:
    | "portrait-pop"
    | "clean-bright"
    | "cinematic"
    | "warm-sunset"
    | "cool-film"
    | "black-white"
    | "lift-shadows"
    | "soft-blur"
    | "strong-blur"
    | "dream-blur"
    | "sharpen"
    | "vignette";
  effectType: "color-adjust" | "blur" | "sharpen" | "vignette";
  params: Partial<ParamValues>;
};

const PRESETS: AdjustmentPreset[] = [
  {
    key: "portrait-pop",
    effectType: "color-adjust",
    params: { brightness: 6, contrast: 10, saturation: 12, shadows: 10 },
  },
  {
    key: "clean-bright",
    effectType: "color-adjust",
    params: { brightness: 10, contrast: 6, exposure: 0.15, highlights: -8 },
  },
  {
    key: "cinematic",
    effectType: "color-adjust",
    params: { contrast: 18, saturation: -8, temperature: -8, fade: 10 },
  },
  {
    key: "warm-sunset",
    effectType: "color-adjust",
    params: { temperature: 28, tint: 4, saturation: 10, highlights: -10 },
  },
  {
    key: "cool-film",
    effectType: "color-adjust",
    params: { temperature: -22, tint: -5, contrast: 12, fade: 8 },
  },
  {
    key: "black-white",
    effectType: "color-adjust",
    params: { blackWhite: true, contrast: 18, shadows: 8 },
  },
  {
    key: "lift-shadows",
    effectType: "color-adjust",
    params: { shadows: 34, highlights: -12, contrast: -4 },
  },
  { key: "soft-blur", effectType: "blur", params: { intensity: 8 } },
  { key: "strong-blur", effectType: "blur", params: { intensity: 24 } },
  { key: "dream-blur", effectType: "blur", params: { intensity: 14 } },
  { key: "sharpen", effectType: "sharpen", params: { amount: 36 } },
  { key: "vignette", effectType: "vignette", params: { amount: 34 } },
];

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

const RATIO_PRESETS: Array<{ key: string; label: string; canvasSize: TCanvasSize }> = [
  { key: "16:9", label: "16:9", canvasSize: { width: 1920, height: 1080 } },
  { key: "9:16", label: "9:16", canvasSize: { width: 1080, height: 1920 } },
  { key: "1:1", label: "1:1", canvasSize: { width: 1080, height: 1080 } },
  { key: "4:3", label: "4:3", canvasSize: { width: 1440, height: 1080 } },
  { key: "3:4", label: "3:4", canvasSize: { width: 1080, height: 1440 } },
  { key: "2:1", label: "2:1", canvasSize: { width: 1920, height: 960 } },
  { key: "21:9", label: "21:9", canvasSize: { width: 2560, height: 1080 } },
];

function isEffectTarget(elementType: string): boolean {
  return ["video", "image", "text", "sticker", "graphic"].includes(elementType);
}

export function AdjustmentView() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { selectedElements } = useElementSelection();
  const activeProject = useEditor((e) => e.project.getActive());
  const mediaAssets = useEditor((e) => e.media.getAssets());
  const selected = useMemo(
    () =>
      editor.timeline
        .getElementsWithTracks({ elements: selectedElements })
        .filter(({ element }) => isEffectTarget(element.type)),
    [editor, selectedElements],
  );
  const activeBlendMode = useMemo(() => {
    if (selected.length === 0) return null;
    const first = String(selected[0].element.params.blendMode ?? "normal");
    return selected.every(
      ({ element }) => String(element.params.blendMode ?? "normal") === first,
    )
      ? first
      : null;
  }, [selected]);

  const applyPreset = (preset: AdjustmentPreset) => {
    if (selected.length === 0) {
      toast.error(
        t("freeTools.mediaTrimmer.editor.adjustmentPanel.selectVisual"),
      );
      return;
    }

    for (const { track, element } of selected) {
      const effectId = editor.timeline.addClipEffect({
        trackId: track.id,
        elementId: element.id,
        effectType: preset.effectType,
      });
      if (effectId) {
        editor.timeline.updateClipEffectParams({
          trackId: track.id,
          elementId: element.id,
          effectId,
          params: preset.params,
        });
      }
    }

    toast.success(
      t("freeTools.mediaTrimmer.editor.adjustmentPanel.applied", {
        count: selected.length,
      }),
    );
  };

  const applyBlendMode = (blendMode: BlendMode) => {
    if (selected.length === 0) {
      toast.error(
        t("freeTools.mediaTrimmer.editor.adjustmentPanel.selectVisual"),
      );
      return;
    }

    editor.timeline.updateElements({
      updates: selected.map(({ track, element }) => ({
        trackId: track.id,
        elementId: element.id,
        patch: {
          params: {
            ...element.params,
            blendMode,
          },
        },
      })),
    });

    toast.success(
      t("freeTools.mediaTrimmer.editor.adjustmentPanel.blendApplied", {
        count: selected.length,
      }),
    );
  };

  const applyRatio = (canvasSize: TCanvasSize) => {
    const fitUpdates = selected
      .map(({ track, element }) => {
        const sourceSize = getElementSourceSize({ element, mediaAssets });
        if (!sourceSize) return null;
        const containScale = Math.min(
          canvasSize.width / sourceSize.width,
          canvasSize.height / sourceSize.height,
        );
        const fillScale =
          Math.max(
            canvasSize.width / sourceSize.width,
            canvasSize.height / sourceSize.height,
          ) / containScale;
        const currentScaleX = getNumberParam({
          params: element.params,
          key: "transform.scaleX",
          fallback: 1,
        });
        const currentScaleY = getNumberParam({
          params: element.params,
          key: "transform.scaleY",
          fallback: 1,
        });
        return {
          trackId: track.id,
          elementId: element.id,
          patch: {
            params: {
              ...element.params,
              "transform.positionX": 0,
              "transform.positionY": 0,
              "transform.scaleX": fillScale * (currentScaleX < 0 ? -1 : 1),
              "transform.scaleY": fillScale * (currentScaleY < 0 ? -1 : 1),
            },
          },
        };
      })
      .filter(Boolean);

    editor.project.updateSettings({
      settings: { canvasSize, canvasSizeMode: "preset" },
    });

    if (fitUpdates.length > 0) {
      editor.timeline.updateElements({
        updates: fitUpdates as Parameters<typeof editor.timeline.updateElements>[0]["updates"],
      });
    }

    toast.success(
      t("freeTools.mediaTrimmer.editor.adjustmentPanel.ratioApplied", {
        ratio: `${canvasSize.width}:${canvasSize.height}`,
      }),
    );
  };

  return (
    <PanelView title={t("freeTools.mediaTrimmer.editor.tabs.adjustment")}>
      <div className="space-y-4">
        <section>
          <h3 className="text-muted-foreground mb-2 px-1 text-xs">
            {t("freeTools.mediaTrimmer.editor.adjustmentPanel.adjustments")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                variant="ghost"
                className="border-border/70 bg-card hover:bg-accent h-10 justify-start rounded-[4px] border px-2 text-left text-xs"
                onClick={() => applyPreset(preset)}
              >
                {t(
                  `freeTools.mediaTrimmer.editor.adjustmentPanel.${preset.key}`,
                )}
              </Button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-muted-foreground mb-2 px-1 text-xs">
            {t("freeTools.mediaTrimmer.editor.adjustmentPanel.smartReframe")}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {RATIO_PRESETS.map((preset) => {
              const isActive =
                activeProject.settings.canvasSize.width === preset.canvasSize.width &&
                activeProject.settings.canvasSize.height === preset.canvasSize.height;
              return (
                <Button
                  key={preset.key}
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "border-border/70 bg-card hover:bg-accent h-9 rounded-[4px] border px-2 text-xs",
                    isActive && "border-primary/70 text-primary",
                  )}
                  onClick={() => applyRatio(preset.canvasSize)}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-muted-foreground mb-2 px-1 text-xs">
            {t("freeTools.mediaTrimmer.editor.adjustmentPanel.blendModes")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {BLEND_MODES.map((blendMode) => (
              <Button
                key={blendMode}
                type="button"
                variant={activeBlendMode === blendMode ? "secondary" : "ghost"}
                className={cn(
                  "border-border/70 bg-card hover:bg-accent h-9 justify-start rounded-[4px] border px-2 text-left text-xs",
                  activeBlendMode === blendMode && "border-primary/70 text-primary",
                )}
                onClick={() => applyBlendMode(blendMode)}
              >
                {t(
                  `freeTools.mediaTrimmer.editor.adjustmentPanel.blend.${blendMode}`,
                )}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </PanelView>
  );
}

function getNumberParam({
  params,
  key,
  fallback,
}: {
  params: ParamValues;
  key: string;
  fallback: number;
}): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getElementSourceSize({
  element,
  mediaAssets,
}: {
  element: TimelineElement;
  mediaAssets: Array<{ id: string; width?: number; height?: number }>;
}): { width: number; height: number } | null {
  if ((element.type === "video" || element.type === "image") && "mediaId" in element) {
    const asset = mediaAssets.find((item) => item.id === element.mediaId);
    if (asset?.width && asset.height) {
      return { width: asset.width, height: asset.height };
    }
  }
  if (element.type === "sticker") {
    return {
      width: element.intrinsicWidth ?? DEFAULT_GRAPHIC_SOURCE_SIZE,
      height: element.intrinsicHeight ?? DEFAULT_GRAPHIC_SOURCE_SIZE,
    };
  }
  if (element.type === "graphic") {
    return {
      width: DEFAULT_GRAPHIC_SOURCE_SIZE,
      height: DEFAULT_GRAPHIC_SOURCE_SIZE,
    };
  }
  return null;
}

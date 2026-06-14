import type { ReactNode } from "react";
import type {
  EffectElement,
  GraphicElement,
  ImageElement,
  RetimableElement,
  StickerElement,
  TextElement,
  VisualElement,
  VideoElement,
  AudioElement,
  TimelineElement,
} from "@/opencut-classic/timeline";
import type { MediaAsset } from "@/opencut-classic/media/types";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  TextFontIcon,
  ArrowExpandIcon,
  RainDropIcon,
  MusicNote03Icon,
  MagicWand05Icon,
  DashboardSpeed02Icon,
} from "@hugeicons/core-free-icons";
import { ElementParamsTab } from "./components/element-params-tab";
import { StandaloneEffectTab } from "@/opencut-classic/effects/components/effects-tab";
import { GraphicTab } from "@/opencut-classic/graphics/components/graphic-tab";
import { OcShapesIcon } from "@/opencut-classic/components/icons";
import {
  AIEffectsInspectorTab,
  AdjustmentInspectorTab,
  AnimationInspectorTab,
  AudioInspectorTab,
  PictureInspectorTab,
  SpeedInspectorTab,
} from "./components/professional-tabs";

const TEXT_PARAM_KEYS = [
  "content",
  "fontFamily",
  "fontSize",
  "color",
  "textAlign",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "letterSpacing",
  "lineHeight",
  "background.enabled",
  "background.color",
  "background.cornerRadius",
  "background.paddingX",
  "background.paddingY",
  "background.offsetX",
  "background.offsetY",
] as const;

export type TabContentProps = {
  trackId: string;
};

export type PropertiesTabDef = {
  id: string;
  label: string;
  icon: ReactNode;
  content: (props: TabContentProps) => ReactNode;
};

export type ElementPropertiesConfig = {
  defaultTab: string;
  tabs: PropertiesTabDef[];
};

function buildTransformTab({
  element,
}: {
  element: VisualElement;
}): PropertiesTabDef {
  return {
    id: "picture",
    label: "Picture",
    icon: <HugeiconsIcon icon={ArrowExpandIcon} size={16} />,
    content: ({ trackId }) => (
      <PictureInspectorTab element={element} trackId={trackId} />
    ),
  };
}

function buildBlendingTab({
  element,
}: {
  element: VisualElement;
}): PropertiesTabDef {
  return {
    id: "adjustment",
    label: "Adjustment",
    icon: <HugeiconsIcon icon={RainDropIcon} size={16} />,
    content: ({ trackId }) => (
      <AdjustmentInspectorTab element={element} trackId={trackId} />
    ),
  };
}

function buildAnimationTab({
  element,
}: {
  element: TimelineElement;
}): PropertiesTabDef {
  return {
    id: "animation",
    label: "Animation",
    icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
    content: ({ trackId }) => (
      <AnimationInspectorTab element={element} trackId={trackId} />
    ),
  };
}

function buildAudioTab({
  element,
}: {
  element: AudioElement | VideoElement;
}): PropertiesTabDef {
  return {
    id: "audio",
    label: "Audio",
    icon: <HugeiconsIcon icon={MusicNote03Icon} size={16} />,
    content: ({ trackId }) => (
      <AudioInspectorTab element={element} trackId={trackId} />
    ),
  };
}

function buildSpeedTab({
  element,
}: {
  element: RetimableElement;
}): PropertiesTabDef {
  return {
    id: "speed",
    label: "Speed",
    icon: <HugeiconsIcon icon={DashboardSpeed02Icon} size={16} />,
    content: ({ trackId }) => (
      <SpeedInspectorTab element={element} trackId={trackId} />
    ),
  };
}

function buildClipEffectsTab({
  element,
}: {
  element: VisualElement;
}): PropertiesTabDef {
  return {
    id: "aiEffects",
    label: "AI Effects",
    icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
    content: ({ trackId }) => (
      <AIEffectsInspectorTab element={element} trackId={trackId} />
    ),
  };
}

function buildTextTab({ element }: { element: TextElement }): PropertiesTabDef {
  return {
    id: "text",
    label: "Text",
    icon: <HugeiconsIcon icon={TextFontIcon} size={16} />,
    content: ({ trackId }) => (
      <ElementParamsTab
        element={element}
        trackId={trackId}
        paramKeys={TEXT_PARAM_KEYS}
        sectionKey="text"
      />
    ),
  };
}

function buildGraphicTab({
  element,
}: {
  element: GraphicElement;
}): PropertiesTabDef {
  return {
    id: "graphic",
    label: "Graphic",
    icon: <OcShapesIcon size={16} />,
    content: ({ trackId }) => (
      <GraphicTab element={element} trackId={trackId} />
    ),
  };
}

function buildStandaloneEffectTab({
  element,
}: {
  element: EffectElement;
}): PropertiesTabDef {
  return {
    id: "aiEffects",
    label: "AI Effects",
    icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
    content: ({ trackId }) => (
      <StandaloneEffectTab element={element} trackId={trackId} />
    ),
  };
}

function getTextConfig({
  element,
}: {
  element: TextElement;
}): ElementPropertiesConfig {
  return {
    defaultTab: "text",
    tabs: [
      buildTextTab({ element }),
      buildTransformTab({ element }),
      buildAnimationTab({ element }),
      buildBlendingTab({ element }),
    ],
  };
}

function getVideoConfig({
  element,
  mediaAsset,
}: {
  element: VideoElement;
  mediaAsset: MediaAsset | undefined;
}): ElementPropertiesConfig {
  const showAudioTab = mediaAsset?.hasAudio !== false;
  return {
    defaultTab: "picture",
    tabs: [
      buildTransformTab({ element }),
      ...(showAudioTab ? [buildAudioTab({ element })] : []),
      buildSpeedTab({ element }),
      buildAnimationTab({ element }),
      buildBlendingTab({ element }),
      buildClipEffectsTab({ element }),
    ],
  };
}

function getImageConfig({
  element,
}: {
  element: ImageElement;
}): ElementPropertiesConfig {
  return {
    defaultTab: "picture",
    tabs: [
      buildTransformTab({ element }),
      buildAnimationTab({ element }),
      buildBlendingTab({ element }),
      buildClipEffectsTab({ element }),
    ],
  };
}

function getStickerConfig({
  element,
}: {
  element: StickerElement;
}): ElementPropertiesConfig {
  return {
    defaultTab: "picture",
    tabs: [
      buildTransformTab({ element }),
      buildAnimationTab({ element }),
      buildBlendingTab({ element }),
      buildClipEffectsTab({ element }),
    ],
  };
}

function getGraphicConfig({
  element,
}: {
  element: GraphicElement;
}): ElementPropertiesConfig {
  return {
    defaultTab: "graphic",
    tabs: [
      buildGraphicTab({ element }),
      buildTransformTab({ element }),
      buildAnimationTab({ element }),
      buildBlendingTab({ element }),
      buildClipEffectsTab({ element }),
    ],
  };
}

function getAudioConfig({
  element,
}: {
  element: AudioElement;
}): ElementPropertiesConfig {
  return {
    defaultTab: "audio",
    tabs: [
      buildAudioTab({ element }),
      buildSpeedTab({ element }),
      buildAnimationTab({ element }),
    ],
  };
}

function getEffectConfig({
  element,
}: {
  element: EffectElement;
}): ElementPropertiesConfig {
  return {
    defaultTab: "aiEffects",
    tabs: [buildStandaloneEffectTab({ element })],
  };
}

export function getPropertiesConfig({
  element,
  mediaAssets,
}: {
  element: TimelineElement;
  mediaAssets: MediaAsset[];
}): ElementPropertiesConfig {
  switch (element.type) {
    case "text":
      return getTextConfig({ element });
    case "video": {
      const mediaAsset = mediaAssets.find((a) => a.id === element.mediaId);
      return getVideoConfig({ element, mediaAsset });
    }
    case "image":
      return getImageConfig({ element });
    case "sticker":
      return getStickerConfig({ element });
    case "graphic":
      return getGraphicConfig({ element });
    case "audio":
      return getAudioConfig({ element });
    case "effect":
      return getEffectConfig({ element });
  }
}

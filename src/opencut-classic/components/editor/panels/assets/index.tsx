"use client";
import {
  type Tab,
  useAssetsPanelStore,
} from "@/opencut-classic/components/editor/panels/assets/assets-panel-store";
import { Captions } from "@/opencut-classic/subtitles/components/assets-view";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/opencut-classic/sounds/components/assets-view";
import { StickersView } from "@/opencut-classic/stickers/components/assets-view";
import { TextView } from "@/opencut-classic/text/components/assets-view";
import { EffectsView } from "@/opencut-classic/effects/components/assets-view";
import { AdjustmentView } from "./views/adjustment";
import { TransitionsView } from "./views/transitions";

export function AssetsPanel() {
  const { activeTab } = useAssetsPanelStore();

  const viewMap: Record<Tab, React.ReactNode> = {
    media: <MediaView />,
    sounds: <SoundsView />,
    text: <TextView />,
    stickers: <StickersView />,
    effects: <EffectsView />,
    transitions: <TransitionsView />,
    captions: <Captions />,
    adjustment: <AdjustmentView />,
    settings: <SettingsView />,
  };

  return (
    <div className="panel bg-background flex h-full flex-col overflow-hidden rounded-none border">
      <div className="min-h-0 flex-1 overflow-hidden">{viewMap[activeTab]}</div>
    </div>
  );
}

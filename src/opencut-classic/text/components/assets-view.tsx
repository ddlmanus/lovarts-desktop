import { DraggableItem } from "@/opencut-classic/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/opencut-classic/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { DEFAULTS } from "@/opencut-classic/timeline/defaults";
import { buildTextElement } from "@/opencut-classic/timeline/element-utils";
import type { MediaTime } from "@/opencut-classic/wasm";
import { useTranslation } from "react-i18next";

export function TextView() {
  const editor = useEditor();
  const { t } = useTranslation();
  const defaultText = t("freeTools.mediaTrimmer.editor.defaultText");

  const handleAddToTimeline = ({ currentTime }: { currentTime: MediaTime }) => {
    const activeScene = editor.scenes.getActiveScene();
    if (!activeScene) return;

    const element = buildTextElement({
      raw: {
        ...DEFAULTS.text.element,
        params: {
          ...DEFAULTS.text.element.params,
          content: defaultText,
        },
      },
      startTime: currentTime,
    });

    editor.timeline.insertElement({
      element,
      placement: { mode: "auto" },
    });
  };

  return (
    <PanelView title={t("freeTools.mediaTrimmer.editor.tabs.text")}>
      <DraggableItem
        name={defaultText}
        preview={
          <div className="bg-accent flex size-full items-center justify-center rounded">
            <span className="text-xs select-none">{defaultText}</span>
          </div>
        }
        dragData={{
          id: "temp-text-id",
          type: DEFAULTS.text.element.type,
          name: DEFAULTS.text.element.name,
          content: defaultText,
        }}
        aspectRatio={1}
        onAddToTimeline={handleAddToTimeline}
        shouldShowLabel={false}
      />
    </PanelView>
  );
}

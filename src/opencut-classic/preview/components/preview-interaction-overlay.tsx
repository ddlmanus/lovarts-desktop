import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePreviewViewport } from "@/opencut-classic/preview/components/preview-viewport";
import { usePreviewInteraction } from "@/opencut-classic/preview/hooks/use-preview-interaction";
import type { SnapLine } from "@/opencut-classic/preview/preview-snap";
import { TransformHandles } from "./transform-handles";
import { MaskHandles } from "./mask-handles";
import { SnapGuides } from "./snap-guides";
import { TextEditOverlay } from "./text-edit-overlay";
import { usePropertiesStore } from "@/opencut-classic/components/editor/panels/properties/stores/properties-store";
import { useEditor } from "@/opencut-classic/editor/use-editor";

export function PreviewInteractionOverlay() {
  const { t } = useTranslation();
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const editor = useEditor();
  const viewport = usePreviewViewport();
  const currentTime = useEditor((e) => e.playback.getCurrentTime());
  const selectedElements = useEditor((e) => e.selection.getSelectedElements());
  const activeTabPerType = usePropertiesStore((s) => s.activeTabPerType);

  const selectedRef =
    selectedElements.length === 1 ? selectedElements[0] : null;
  const activeTrack = selectedRef
    ? editor.timeline.getTrackById({ trackId: selectedRef.trackId })
    : null;
  const activeElement =
    activeTrack?.elements.find(
      (element) => element.id === selectedRef?.elementId,
    ) ?? null;
  const isMaskMode = activeElement
    ? activeTabPerType[activeElement.type] === "masks"
    : false;

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    editingText,
    commitTextEdit,
  } = usePreviewInteraction({
    onSnapLinesChange: setSnapLines,
    isMaskMode,
  });

  const isEditingTextInRange =
    !editingText ||
    (currentTime >= editingText.element.startTime &&
      currentTime <
        editingText.element.startTime + editingText.element.duration);

  useEffect(() => {
    if (editingText && !isEditingTextInRange) {
      commitTextEdit();
    }
  }, [commitTextEdit, editingText, isEditingTextInRange]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (viewport.handlePanPointerDown({ event })) {
      return;
    }

    onPointerDown(event);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (viewport.handlePanPointerMove({ event })) {
      return;
    }

    onPointerMove(event);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (viewport.handlePanPointerUp({ event })) {
      return;
    }

    onPointerUp(event);
  };

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 pointer-events-auto"
        role="application"
        aria-label={t("freeTools.mediaTrimmer.editor.previewCanvas")}
        style={{
          cursor: viewport.isPanning
            ? "grabbing"
            : viewport.canPan
              ? "default"
              : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={onDoubleClick}
        onDragStart={(e) => e.preventDefault()}
      />
      {editingText && isEditingTextInRange ? (
        <TextEditOverlay
          trackId={editingText.trackId}
          elementId={editingText.elementId}
          element={editingText.element}
          onCommit={commitTextEdit}
        />
      ) : isMaskMode ? (
        <MaskHandles onSnapLinesChange={setSnapLines} />
      ) : (
        <TransformHandles onSnapLinesChange={setSnapLines} />
      )}
      <SnapGuides lines={snapLines} />
    </div>
  );
}

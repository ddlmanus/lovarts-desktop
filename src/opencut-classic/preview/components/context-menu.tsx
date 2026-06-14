"use client";

import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/opencut-classic/components/ui/context-menu";
import { usePreviewViewport } from "@/opencut-classic/preview/components/preview-viewport";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import type { PreviewOverlayControl } from "@/opencut-classic/preview/overlays";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function PreviewContextMenu({
  onToggleFullscreen,
  container,
  overlayControls,
  onOverlayVisibilityChange,
}: {
  onToggleFullscreen: () => void;
  container: HTMLElement | null;
  overlayControls: PreviewOverlayControl[];
  onOverlayVisibilityChange: (params: {
    overlayId: string;
    isVisible: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const viewport = usePreviewViewport();

  const handleCopySnapshot = async () => {
    const result = await editor.renderer.copySnapshot();

    if (!result.success) {
      toast.error(t("freeTools.mediaTrimmer.editor.failedCopySnapshot"), {
        description:
          result.error ?? t("freeTools.mediaTrimmer.editor.tryAgain"),
      });
      return;
    }
  };

  const handleSaveSnapshot = async () => {
    const result = await editor.renderer.saveSnapshot();

    if (!result.success) {
      toast.error(t("freeTools.mediaTrimmer.editor.failedSaveSnapshot"), {
        description:
          result.error ?? t("freeTools.mediaTrimmer.editor.tryAgain"),
      });
      return;
    }
  };

  return (
    <ContextMenuContent className="w-56" container={container}>
      <ContextMenuItem onClick={viewport.fitToScreen} inset>
        {t("freeTools.mediaTrimmer.editor.fitToScreen")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onToggleFullscreen} inset>
        {t("freeTools.mediaTrimmer.editor.fullScreen")}
      </ContextMenuItem>
      <ContextMenuItem onClick={handleSaveSnapshot} inset>
        {t("freeTools.mediaTrimmer.editor.saveSnapshot")}
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCopySnapshot} inset>
        {t("freeTools.mediaTrimmer.editor.copySnapshot")}
      </ContextMenuItem>
      {overlayControls.length > 0 ? <ContextMenuSeparator /> : null}
      {overlayControls.map((overlayControl) => (
        <ContextMenuCheckboxItem
          key={overlayControl.id}
          checked={overlayControl.isVisible}
          onCheckedChange={(checked) =>
            onOverlayVisibilityChange({
              overlayId: overlayControl.id,
              isVisible: !!checked,
            })
          }
        >
          {overlayControl.label}
        </ContextMenuCheckboxItem>
      ))}
    </ContextMenuContent>
  );
}

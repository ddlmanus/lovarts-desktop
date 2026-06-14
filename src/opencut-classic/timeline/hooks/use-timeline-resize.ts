import { useEffect, useReducer, useState } from "react";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { useCommittedRef } from "@/opencut-classic/hooks/use-committed-ref";
import { useShiftKey } from "@/opencut-classic/hooks/use-shift-key";
import { useElementSelection } from "@/opencut-classic/timeline/hooks/element/use-element-selection";
import { useTimelineStore } from "@/opencut-classic/timeline/timeline-store";
import { registerCanceller } from "@/opencut-classic/editor/cancel-interaction";
import {
	ResizeController,
	type ResizeConfig,
} from "@/opencut-classic/timeline/controllers/resize-controller";
import type { ResizeSide } from "@/opencut-classic/timeline/group-resize";
import type { SnapPoint } from "@/opencut-classic/timeline/snapping";
import type { TimelineElement } from "@/opencut-classic/timeline";

export type { ResizeSide };

interface UseTimelineResizeProps {
	zoomLevel: number;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
}

export function useTimelineResize({
	zoomLevel,
	onSnapPointChange,
}: UseTimelineResizeProps) {
	const editor = useEditor();
	const isShiftHeldRef = useShiftKey();
	const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
	const { selectedElements } = useElementSelection();

	const config: ResizeConfig = {
		zoomLevel,
		snappingEnabled,
		isShiftHeld: () => isShiftHeldRef.current,
		getSceneTracks: () => editor.scenes.getActiveScene().tracks,
		getCurrentPlayheadTime: () => editor.playback.getCurrentTime(),
		getActiveProjectFps: () => editor.project.getActive()?.settings.fps ?? null,
		selectedElements,
		discardPreview: () => editor.timeline.discardPreview(),
		previewElements: (updates) =>
			editor.timeline.previewElements({
				updates: updates.map(({ trackId, elementId, patch }) => ({
					trackId,
					elementId,
					updates: patch as Partial<TimelineElement>,
				})),
			}),
		commitElements: (updates) =>
			editor.timeline.updateElements({
				updates: updates.map(({ trackId, elementId, patch }) => ({
					trackId,
					elementId,
					patch: patch as Partial<TimelineElement>,
				})),
			}),
		onSnapPointChange,
	};
	const configRef = useCommittedRef(config);
	const [controller] = useState(() => new ResizeController({ configRef }));

	const [, rerender] = useReducer((n: number) => n + 1, 0);
	useEffect(() => controller.subscribe(rerender), [controller]);

	useEffect(() => {
		if (!controller.isResizing) return;
		return registerCanceller({ fn: () => controller.cancel() });
	}, [controller.isResizing, controller]);

	useEffect(() => () => controller.destroy(), [controller]);

	return {
		isResizing: controller.isResizing,
		handleResizeStart: controller.onResizeStart,
	};
}

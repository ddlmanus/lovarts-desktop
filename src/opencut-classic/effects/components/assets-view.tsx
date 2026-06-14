"use client";

import { useEffect, useRef, useCallback } from "react";
import { PanelView } from "@/opencut-classic/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/opencut-classic/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/opencut-classic/effects";
import { effectPreviewService } from "@/opencut-classic/services/renderer/effect-preview";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { buildEffectElement } from "@/opencut-classic/timeline/element-utils";
import type { EffectDefinition } from "@/opencut-classic/effects/types";
import { useTranslation } from "react-i18next";

export function EffectsView() {
	const { t } = useTranslation();
	const effects = effectsRegistry.getAll();

	return (
		<PanelView title={t("freeTools.mediaTrimmer.editor.effects")}>
			<EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();
	const { t } = useTranslation();
	const effectName = t(`freeTools.mediaTrimmer.editor.effectNames.${effect.type}`, {
		defaultValue: effect.name,
	});

	const handleAddToTimeline = useCallback(() => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effectName}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effectName,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}

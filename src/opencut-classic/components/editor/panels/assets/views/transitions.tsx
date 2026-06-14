"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { PanelView } from "@/opencut-classic/components/editor/panels/assets/views/base-panel";
import { Button } from "@/opencut-classic/components/ui/button";
import { Input } from "@/opencut-classic/components/ui/input";
import { useEditor } from "@/opencut-classic/editor/use-editor";
import { useElementSelection } from "@/opencut-classic/timeline/hooks/element/use-element-selection";
import { cn } from "@/opencut-classic/utils/ui";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	subMediaTime,
} from "@/opencut-classic/wasm";
import type { AnimationPath } from "@/opencut-classic/animation/types";

type TransitionCategory = "favorites" | "effects";
type TransitionMotion =
	| "fade"
	| "fade-out"
	| "fade-both"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "slide-down"
	| "push-left"
	| "push-down"
	| "zoom-in"
	| "zoom-out"
	| "flash-white"
	| "flash-black"
	| "rotate"
	| "flip"
	| "blur"
	| "pixel"
	| "wipe"
	| "page"
	| "ripple";

type TransitionPreset = {
	key: string;
	category: TransitionCategory;
	motion: TransitionMotion;
	premium?: boolean;
};

const PRESETS: TransitionPreset[] = [
	{ key: "slice-pan", category: "effects", motion: "slide-left", premium: true },
	{ key: "color-slide", category: "effects", motion: "slide-right", premium: true },
	{ key: "vertical-blinds", category: "effects", motion: "wipe" },
	{ key: "flash-black", category: "effects", motion: "flash-black" },
	{ key: "dissolve", category: "effects", motion: "fade-both" },
	{ key: "book-flip", category: "effects", motion: "flip" },
	{ key: "pull-left", category: "effects", motion: "push-left" },
	{ key: "ink-spread", category: "effects", motion: "blur" },
	{ key: "mirror-flip", category: "effects", motion: "rotate" },
	{ key: "cloud", category: "effects", motion: "fade" },
	{ key: "push-down", category: "effects", motion: "push-down" },
	{ key: "glare-ii", category: "effects", motion: "flash-white" },
	{ key: "pixel-push", category: "effects", motion: "pixel" },
	{ key: "page-turn", category: "effects", motion: "page" },
	{ key: "water-right", category: "effects", motion: "ripple" },
	{ key: "round-square", category: "effects", motion: "zoom-in" },
	{ key: "flash-black-ii", category: "effects", motion: "flash-black" },
	{ key: "old-film-scratch", category: "effects", motion: "fade-out" },
	{ key: "flash-white", category: "effects", motion: "flash-white" },
	{ key: "move-left", category: "effects", motion: "slide-left" },
];

function isOpacityTarget(elementType: string): boolean {
	return ["video", "image", "text", "sticker", "graphic"].includes(elementType);
}

export function TransitionsView() {
	const { t } = useTranslation();
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const [category, setCategory] = useState<TransitionCategory>("effects");
	const [query, setQuery] = useState("");

	const visiblePresets = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return PRESETS.filter((preset) => {
			const label = t(
				`freeTools.mediaTrimmer.editor.transitionsPanel.presets.${preset.key}`,
			).toLowerCase();
			const matchesCategory =
				category === "favorites" ? preset.premium : preset.category === category;
			const matchesQuery =
				normalizedQuery.length === 0 ||
				label.includes(normalizedQuery) ||
				preset.key.includes(normalizedQuery);
			return matchesCategory && matchesQuery;
		});
	}, [category, query, t]);

	const applyPreset = (preset: TransitionPreset) => {
		const selected = editor.timeline
			.getElementsWithTracks({ elements: selectedElements })
			.filter(({ element }) => isOpacityTarget(element.type));

		if (selected.length === 0) {
			toast.error(
				t("freeTools.mediaTrimmer.editor.transitionsPanel.selectVisual"),
			);
			return;
		}

		const keyframes = selected.flatMap(({ track, element }) =>
			buildTransitionKeyframes({
				preset,
				trackId: track.id,
				elementId: element.id,
				duration: element.duration,
			}),
		);

		editor.timeline.upsertKeyframes({ keyframes });
		toast.success(
			t("freeTools.mediaTrimmer.editor.transitionsPanel.applied", {
				count: selected.length,
			}),
		);
	};

	return (
		<PanelView
			title={t("freeTools.mediaTrimmer.editor.tabs.transitions")}
			contentClassName="px-0"
		>
			<div className="flex h-full min-h-0 gap-3 px-3">
				<aside className="flex w-24 shrink-0 flex-col gap-2 pt-1">
					<CategoryButton
						active={category === "favorites"}
						label={t("freeTools.mediaTrimmer.editor.transitionsPanel.favorites")}
						onClick={() => setCategory("favorites")}
					/>
					<CategoryButton
						active={category === "effects"}
						label={t("freeTools.mediaTrimmer.editor.transitionsPanel.effects")}
						onClick={() => setCategory("effects")}
					/>
				</aside>
				<div className="min-w-0 flex-1 space-y-3">
					<div className="relative">
						<HugeiconsIcon
							icon={Search01Icon}
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							value={query}
							onChange={(event) => setQuery(event.currentTarget.value)}
							placeholder={t(
								"freeTools.mediaTrimmer.editor.transitionsPanel.search",
							)}
							size="sm"
							className="h-9 rounded-[4px] border-border/70 bg-card pl-9"
						/>
					</div>
					<h3 className="px-1 text-sm font-medium text-foreground">
						{t("freeTools.mediaTrimmer.editor.transitionsPanel.hot")}
					</h3>
					<div className="grid grid-cols-3 gap-x-3 gap-y-4 xl:grid-cols-4 2xl:grid-cols-5">
						{visiblePresets.map((preset) => (
							<TransitionCard
								key={preset.key}
								preset={preset}
								label={t(
									`freeTools.mediaTrimmer.editor.transitionsPanel.presets.${preset.key}`,
								)}
								onClick={() => applyPreset(preset)}
							/>
						))}
					</div>
				</div>
			</div>
		</PanelView>
	);
}

function CategoryButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant={active ? "secondary" : "ghost"}
			className={cn(
				"h-9 justify-start rounded-[4px] px-3 text-sm",
				active && "bg-secondary text-primary",
			)}
			onClick={onClick}
		>
			{label}
		</Button>
	);
}

function TransitionCard({
	preset,
	label,
	onClick,
}: {
	preset: TransitionPreset;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="group min-w-0 text-left"
			onClick={onClick}
			title={label}
		>
			<div className="relative aspect-square overflow-hidden rounded-[7px] border border-border/60 bg-card transition group-hover:border-primary/70">
				<TransitionThumbnail motion={preset.motion} />
				{preset.premium && (
					<span className="absolute left-2 top-2 grid size-4 place-items-center rounded-sm bg-primary text-[9px] font-bold text-primary-foreground">
						◆
					</span>
				)}
				<span className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white/90">
					<HugeiconsIcon icon={Download04Icon} className="size-4" />
				</span>
			</div>
			<div className="mt-1.5 truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
				{label}
			</div>
		</button>
	);
}

function TransitionThumbnail({ motion }: { motion: TransitionMotion }) {
	return (
		<div className={cn("transition-thumb absolute inset-0", `transition-thumb-${motion}`)}>
			<div className="transition-thumb-scene scene-a" />
			<div className="transition-thumb-scene scene-b" />
			<div className="transition-thumb-mark" />
		</div>
	);
}

function buildTransitionKeyframes({
	preset,
	trackId,
	elementId,
	duration,
}: {
	preset: TransitionPreset;
	trackId: string;
	elementId: string;
	duration: number;
}) {
	const durationSeconds = mediaTimeToSeconds({ time: duration });
	const transitionSeconds = Math.min(0.85, Math.max(0.22, durationSeconds / 3));
	const t0 = mediaTimeFromSeconds({ seconds: 0 });
	const t1 = mediaTimeFromSeconds({ seconds: transitionSeconds });
	const end0 = subMediaTime({ a: duration, b: t1 });
	const end1 = duration;
	const entries: Array<{
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		time: number;
		value: number;
		interpolation: "linear";
	}> = [];
	const add = (propertyPath: AnimationPath, time: number, value: number) => {
		entries.push({ trackId, elementId, propertyPath, time, value, interpolation: "linear" });
	};
	const fadeIn = () => {
		add("opacity", t0, 0);
		add("opacity", t1, 1);
	};
	const fadeOut = () => {
		add("opacity", end0, 1);
		add("opacity", end1, 0);
	};

	switch (preset.motion) {
		case "fade":
			fadeIn();
			break;
		case "fade-out":
			fadeOut();
			break;
		case "fade-both":
		case "blur":
		case "ripple":
			fadeIn();
			fadeOut();
			break;
		case "slide-left":
		case "push-left":
			add("transform.positionX", t0, 360);
			add("transform.positionX", t1, 0);
			fadeIn();
			break;
		case "slide-right":
			add("transform.positionX", t0, -360);
			add("transform.positionX", t1, 0);
			fadeIn();
			break;
		case "slide-up":
			add("transform.positionY", t0, 360);
			add("transform.positionY", t1, 0);
			fadeIn();
			break;
		case "slide-down":
		case "push-down":
			add("transform.positionY", t0, -360);
			add("transform.positionY", t1, 0);
			fadeIn();
			break;
		case "zoom-in":
			add("transform.scaleX", t0, 1.18);
			add("transform.scaleY", t0, 1.18);
			add("transform.scaleX", t1, 1);
			add("transform.scaleY", t1, 1);
			fadeIn();
			break;
		case "zoom-out":
			add("transform.scaleX", t0, 0.78);
			add("transform.scaleY", t0, 0.78);
			add("transform.scaleX", t1, 1);
			add("transform.scaleY", t1, 1);
			fadeIn();
			break;
		case "flash-white":
		case "flash-black":
		case "pixel":
		case "wipe":
			add("opacity", t0, 0);
			add("opacity", mediaTimeFromSeconds({ seconds: transitionSeconds * 0.45 }), 0.35);
			add("opacity", t1, 1);
			break;
		case "rotate":
			add("transform.rotate", t0, -8);
			add("transform.rotate", t1, 0);
			fadeIn();
			break;
		case "flip":
		case "page":
			add("transform.scaleX", t0, 0.08);
			add("transform.scaleX", t1, 1);
			fadeIn();
			break;
	}

	return entries;
}

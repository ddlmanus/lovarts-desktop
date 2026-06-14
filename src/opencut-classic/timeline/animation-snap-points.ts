import { getElementKeyframes } from "@/opencut-classic/animation";
import type { SceneTracks } from "@/opencut-classic/timeline";
import type { SnapPoint } from "@/opencut-classic/timeline/snapping";
import { addMediaTime } from "@/opencut-classic/wasm";

export function getAnimationKeyframeSnapPointsForTimeline({
	tracks,
	excludeElementIds,
}: {
	tracks: SceneTracks;
	excludeElementIds?: Set<string>;
}): SnapPoint[] {
	const snapPoints: SnapPoint[] = [];
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];

	for (const track of orderedTracks) {
		for (const element of track.elements) {
			if (excludeElementIds?.has(element.id)) {
				continue;
			}

			for (const keyframe of getElementKeyframes({
				animations: element.animations,
			})) {
				snapPoints.push({
					time: addMediaTime({ a: element.startTime, b: keyframe.time }),
					type: "keyframe",
					elementId: element.id,
					trackId: track.id,
				});
			}
		}
	}

	return snapPoints;
}

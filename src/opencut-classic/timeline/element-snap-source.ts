import type { SceneTracks } from "@/opencut-classic/timeline";
import type { SnapPoint } from "@/opencut-classic/timeline/snapping";
import { addMediaTime } from "@/opencut-classic/wasm";

export function getElementEdgeSnapPoints({
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

			snapPoints.push(
				{
					time: element.startTime,
					type: "element-start",
					elementId: element.id,
					trackId: track.id,
				},
				{
					time: addMediaTime({ a: element.startTime, b: element.duration }),
					type: "element-end",
					elementId: element.id,
					trackId: track.id,
				},
			);
		}
	}

	return snapPoints;
}

import type { SnapPoint } from "@/opencut-classic/timeline/snapping";
import type { MediaTime } from "@/opencut-classic/wasm";

export function getPlayheadSnapPoints({
	playheadTime,
}: {
	playheadTime: MediaTime;
}): SnapPoint[] {
	return [{ time: playheadTime, type: "playhead" }];
}

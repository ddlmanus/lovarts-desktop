import type { Bookmark } from "@/opencut-classic/timeline";
import type { SnapPoint } from "@/opencut-classic/timeline/snapping";
import type { MediaTime } from "@/opencut-classic/wasm";

export function getBookmarkSnapPoints({
	bookmarks,
	excludeBookmarkTime,
}: {
	bookmarks: Bookmark[];
	excludeBookmarkTime?: MediaTime;
}): SnapPoint[] {
	return bookmarks.flatMap((bookmark) => {
		if (excludeBookmarkTime != null && bookmark.time === excludeBookmarkTime) {
			return [];
		}

		return [
			{ time: bookmark.time, type: "bookmark" satisfies SnapPoint["type"] },
		];
	});
}

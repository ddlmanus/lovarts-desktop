import { Command, type CommandResult } from "@/opencut-classic/commands/base-command";
import { EditorCore } from "@/opencut-classic/core";
import type { TScene } from "@/opencut-classic/timeline";
import { updateSceneInArray } from "@/opencut-classic/timeline/scenes";
import { getFrameTime, moveBookmarkInArray } from "@/opencut-classic/timeline/bookmarks/index";
import type { MediaTime } from "@/opencut-classic/wasm";

export class MoveBookmarkCommand extends Command {
	private savedScenes: TScene[] | null = null;

	constructor({
		fromTime,
		toTime,
	}: {
		fromTime: MediaTime;
		toTime: MediaTime;
	}) {
		super();
		this.fromTime = fromTime;
		this.toTime = toTime;
	}

	private fromTime: MediaTime;
	private toTime: MediaTime;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const activeScene = editor.scenes.getActiveScene();
		const activeProject = editor.project.getActive();

		if (!activeScene || !activeProject) {
			return;
		}

		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];

		const fromFrameTime = getFrameTime({
			time: this.fromTime,
			fps: activeProject.settings.fps,
		});
		const toFrameTime = getFrameTime({
			time: this.toTime,
			fps: activeProject.settings.fps,
		});

		const updatedBookmarks = moveBookmarkInArray({
			bookmarks: activeScene.bookmarks,
			fromTime: fromFrameTime,
			toTime: toFrameTime,
		});

		const updatedScenes = updateSceneInArray({
			scenes,
			sceneId: activeScene.id,
			updates: { bookmarks: updatedBookmarks },
		});

		editor.scenes.setScenes({ scenes: updatedScenes });
	}

	undo(): void {
		if (this.savedScenes) {
			const editor = EditorCore.getInstance();
			editor.scenes.setScenes({ scenes: this.savedScenes });
		}
	}
}

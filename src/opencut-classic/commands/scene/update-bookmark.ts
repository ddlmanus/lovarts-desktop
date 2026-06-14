import { Command, type CommandResult } from "@/opencut-classic/commands/base-command";
import { EditorCore } from "@/opencut-classic/core";
import type { Bookmark, TScene } from "@/opencut-classic/timeline";
import { updateSceneInArray } from "@/opencut-classic/timeline/scenes";
import {
	getFrameTime,
	updateBookmarkInArray,
} from "@/opencut-classic/timeline/bookmarks/index";
import type { MediaTime } from "@/opencut-classic/wasm";

export class UpdateBookmarkCommand extends Command {
	private savedScenes: TScene[] | null = null;

	constructor({
		time,
		updates,
	}: {
		time: MediaTime;
		updates: Partial<Omit<Bookmark, "time">>;
	}) {
		super();
		this.time = time;
		this.updates = updates;
	}

	private time: MediaTime;
	private updates: Partial<Omit<Bookmark, "time">>;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const activeScene = editor.scenes.getActiveScene();
		const activeProject = editor.project.getActive();

		if (!activeScene || !activeProject) {
			return;
		}

		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];

		const frameTime = getFrameTime({
			time: this.time,
			fps: activeProject.settings.fps,
		});

		const updatedBookmarks = updateBookmarkInArray({
			bookmarks: activeScene.bookmarks,
			frameTime,
			updates: this.updates,
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

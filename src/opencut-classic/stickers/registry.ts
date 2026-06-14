import type { StickerProvider } from "@/opencut-classic/stickers/types";
import { DefinitionRegistry } from "@/opencut-classic/params/registry";

export class StickersRegistry extends DefinitionRegistry<string, StickerProvider> {
	constructor() {
		super("sticker provider");
	}
}

export const stickersRegistry = new StickersRegistry();

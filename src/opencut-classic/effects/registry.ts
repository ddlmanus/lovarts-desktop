import { DefinitionRegistry } from "@/opencut-classic/params/registry";
import type { EffectDefinition } from "@/opencut-classic/effects/types";

export class EffectsRegistry extends DefinitionRegistry<string, EffectDefinition> {
	constructor() {
		super("effect");
	}
}

export const effectsRegistry = new EffectsRegistry();

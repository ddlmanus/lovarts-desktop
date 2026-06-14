import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import {
	colorAdjustmentEffectDefinition,
	sharpenEffectDefinition,
	vignetteEffectDefinition,
} from "./adjustments";

const defaultEffects = [
	blurEffectDefinition,
	colorAdjustmentEffectDefinition,
	vignetteEffectDefinition,
	sharpenEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}

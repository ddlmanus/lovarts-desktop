import type { EffectDefinition, EffectPass } from "@/opencut-classic/effects/types";

function readNumber(params: Record<string, unknown>, key: string, fallback = 0): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(params: Record<string, unknown>, key: string): boolean {
	return params[key] === true;
}

function hasAnyAdjustment(params: Record<string, unknown>): boolean {
	return (
		readNumber(params, "brightness") !== 0 ||
		readNumber(params, "contrast") !== 0 ||
		readNumber(params, "saturation") !== 0 ||
		readNumber(params, "exposure") !== 0 ||
		readNumber(params, "temperature") !== 0 ||
		readNumber(params, "tint") !== 0 ||
		readNumber(params, "highlights") !== 0 ||
		readNumber(params, "shadows") !== 0 ||
		readNumber(params, "fade") !== 0 ||
		readBoolean(params, "blackWhite")
	);
}

export const colorAdjustmentEffectDefinition: EffectDefinition = {
	type: "color-adjust",
	name: "Adjust",
	keywords: ["adjust", "brightness", "contrast", "saturation", "temperature"],
	params: [
		{ key: "brightness", label: "Brightness", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "contrast", label: "Contrast", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "saturation", label: "Saturation", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "exposure", label: "Exposure", type: "number", default: 0, min: -2, max: 2, step: 0.05 },
		{ key: "temperature", label: "Temperature", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "tint", label: "Tint", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "highlights", label: "Highlights", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "shadows", label: "Shadows", type: "number", default: 0, min: -100, max: 100, step: 1 },
		{ key: "fade", label: "Fade", type: "number", default: 0, min: 0, max: 100, step: 1 },
		{ key: "blackWhite", label: "Black & White", type: "boolean", default: false },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => {
			if (!hasAnyAdjustment(effectParams)) return [];
			return [
				{
					shader: "cpu-color-adjust",
					uniforms: {
						u_brightness: readNumber(effectParams, "brightness"),
						u_contrast: readNumber(effectParams, "contrast"),
						u_saturation: readNumber(effectParams, "saturation"),
						u_exposure: readNumber(effectParams, "exposure"),
						u_temperature: readNumber(effectParams, "temperature"),
						u_tint: readNumber(effectParams, "tint"),
						u_highlights: readNumber(effectParams, "highlights"),
						u_shadows: readNumber(effectParams, "shadows"),
						u_fade: readNumber(effectParams, "fade"),
						u_black_white: readBoolean(effectParams, "blackWhite") ? 1 : 0,
					},
				} satisfies EffectPass,
			];
		},
	},
};

export const vignetteEffectDefinition: EffectDefinition = {
	type: "vignette",
	name: "Vignette",
	keywords: ["vignette", "edge", "shadow"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 35, min: -100, max: 100, step: 1 },
		{ key: "midpoint", label: "Midpoint", type: "number", default: 48, min: 1, max: 100, step: 1 },
		{ key: "feather", label: "Feather", type: "number", default: 64, min: 1, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => {
			const amount = readNumber(effectParams, "amount", 35);
			if (Math.abs(amount) < 0.01) return [];
			return [
				{
					shader: "cpu-vignette",
					uniforms: {
						u_amount: amount,
						u_midpoint: readNumber(effectParams, "midpoint", 48),
						u_feather: readNumber(effectParams, "feather", 64),
					},
				},
			];
		},
	},
};

export const sharpenEffectDefinition: EffectDefinition = {
	type: "sharpen",
	name: "Sharpen",
	keywords: ["sharpen", "clarity", "details"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 35, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => {
			const amount = readNumber(effectParams, "amount", 35);
			if (amount <= 0) return [];
			return [
				{
					shader: "cpu-sharpen",
					uniforms: { u_amount: amount },
				},
			];
		},
	},
};

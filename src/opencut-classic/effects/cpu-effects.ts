import type { EffectPass } from "@/opencut-classic/effects/types";
import { createCanvasSurface } from "@/opencut-classic/services/renderer/canvas-utils";
import { clamp } from "@/opencut-classic/utils/math";

const CPU_EFFECT_SHADERS = new Set([
	"cpu-color-adjust",
	"cpu-vignette",
	"cpu-sharpen",
]);

export function isCpuEffectPass(pass: EffectPass): boolean {
	return CPU_EFFECT_SHADERS.has(pass.shader);
}

export function partitionEffectPassGroups({
	effectPassGroups,
}: {
	effectPassGroups: EffectPass[][];
}): {
	cpuPasses: EffectPass[];
	gpuEffectPassGroups: EffectPass[][];
} {
	const cpuPasses: EffectPass[] = [];
	const gpuEffectPassGroups: EffectPass[][] = [];

	for (const group of effectPassGroups) {
		const gpuGroup: EffectPass[] = [];
		for (const pass of group) {
			if (isCpuEffectPass(pass)) {
				cpuPasses.push(pass);
			} else {
				gpuGroup.push(pass);
			}
		}
		if (gpuGroup.length > 0) {
			gpuEffectPassGroups.push(gpuGroup);
		}
	}

	return { cpuPasses, gpuEffectPassGroups };
}

export function applyCpuEffectPasses({
	source,
	width,
	height,
	passes,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
	passes: EffectPass[];
}): OffscreenCanvas {
	const { canvas, context } = createCanvasSurface({ width, height });
	context.clearRect(0, 0, width, height);
	context.drawImage(source, 0, 0, width, height);
	applyCpuEffectPassesToContext({ context, width, height, passes });
	return canvas;
}

export function applyCpuEffectPassesToContext({
	context,
	width,
	height,
	passes,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	passes: EffectPass[];
}): void {
	if (passes.length === 0 || width <= 0 || height <= 0) return;

	for (const pass of passes) {
		if (pass.shader === "cpu-sharpen") {
			applySharpenPass({ context, width, height, pass });
			continue;
		}

		const imageData = context.getImageData(0, 0, width, height);
		if (pass.shader === "cpu-color-adjust") {
			applyColorAdjustPass({ imageData, pass });
		} else if (pass.shader === "cpu-vignette") {
			applyVignettePass({ imageData, width, height, pass });
		}
		context.putImageData(imageData, 0, 0);
	}
}

function readUniform(pass: EffectPass, key: string, fallback = 0): number {
	const value = pass.uniforms[key];
	if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
	if (Array.isArray(value) && typeof value[0] === "number") {
		return Number.isFinite(value[0]) ? value[0] : fallback;
	}
	return fallback;
}

function applyColorAdjustPass({
	imageData,
	pass,
}: {
	imageData: ImageData;
	pass: EffectPass;
}) {
	const brightness = readUniform(pass, "u_brightness") / 100;
	const contrast = 1 + readUniform(pass, "u_contrast") / 100;
	const saturation = 1 + readUniform(pass, "u_saturation") / 100;
	const exposure = Math.pow(2, readUniform(pass, "u_exposure"));
	const temperature = readUniform(pass, "u_temperature") / 100;
	const tint = readUniform(pass, "u_tint") / 100;
	const highlights = readUniform(pass, "u_highlights") / 100;
	const shadows = readUniform(pass, "u_shadows") / 100;
	const fade = readUniform(pass, "u_fade") / 100;
	const blackWhite = readUniform(pass, "u_black_white") >= 0.5;

	const data = imageData.data;
	for (let i = 0; i < data.length; i += 4) {
		let r = data[i] / 255;
		let g = data[i + 1] / 255;
		let b = data[i + 2] / 255;

		r *= exposure;
		g *= exposure;
		b *= exposure;

		r += brightness;
		g += brightness;
		b += brightness;

		r = (r - 0.5) * contrast + 0.5;
		g = (g - 0.5) * contrast + 0.5;
		b = (b - 0.5) * contrast + 0.5;

		const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
		if (saturation !== 1 || blackWhite) {
			const sat = blackWhite ? 0 : saturation;
			r = luma + (r - luma) * sat;
			g = luma + (g - luma) * sat;
			b = luma + (b - luma) * sat;
		}

		if (temperature !== 0) {
			r += temperature * 0.12;
			b -= temperature * 0.12;
			g += temperature * 0.03;
		}
		if (tint !== 0) {
			r += tint * 0.08;
			b += tint * 0.08;
			g -= tint * 0.1;
		}

		const highlightWeight = smoothstep(0.45, 1, luma);
		const shadowWeight = 1 - smoothstep(0, 0.55, luma);
		r += highlights * highlightWeight * 0.22 + shadows * shadowWeight * 0.22;
		g += highlights * highlightWeight * 0.22 + shadows * shadowWeight * 0.22;
		b += highlights * highlightWeight * 0.22 + shadows * shadowWeight * 0.22;

		if (fade > 0) {
			r = r * (1 - fade * 0.28) + fade * 0.12;
			g = g * (1 - fade * 0.28) + fade * 0.12;
			b = b * (1 - fade * 0.28) + fade * 0.12;
		}

		data[i] = Math.round(clamp({ value: r, min: 0, max: 1 }) * 255);
		data[i + 1] = Math.round(clamp({ value: g, min: 0, max: 1 }) * 255);
		data[i + 2] = Math.round(clamp({ value: b, min: 0, max: 1 }) * 255);
	}
}

function applyVignettePass({
	imageData,
	width,
	height,
	pass,
}: {
	imageData: ImageData;
	width: number;
	height: number;
	pass: EffectPass;
}) {
	const amount = clamp({ value: readUniform(pass, "u_amount") / 100, min: -1, max: 1 });
	const feather = clamp({ value: readUniform(pass, "u_feather", 65) / 100, min: 0.05, max: 1 });
	const midpoint = clamp({ value: readUniform(pass, "u_midpoint", 50) / 100, min: 0.05, max: 0.95 });
	const data = imageData.data;
	const cx = (width - 1) / 2;
	const cy = (height - 1) / 2;
	const maxDistance = Math.sqrt(cx * cx + cy * cy) || 1;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDistance;
			const edge = smoothstep(midpoint, Math.min(1, midpoint + feather), distance);
			const factor = amount >= 0 ? 1 - edge * amount : 1 + edge * Math.abs(amount);
			const i = (y * width + x) * 4;
			data[i] = Math.round(clamp({ value: (data[i] / 255) * factor, min: 0, max: 1 }) * 255);
			data[i + 1] = Math.round(clamp({ value: (data[i + 1] / 255) * factor, min: 0, max: 1 }) * 255);
			data[i + 2] = Math.round(clamp({ value: (data[i + 2] / 255) * factor, min: 0, max: 1 }) * 255);
		}
	}
}

function applySharpenPass({
	context,
	width,
	height,
	pass,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	pass: EffectPass;
}) {
	const amount = clamp({ value: readUniform(pass, "u_amount") / 100, min: 0, max: 2 });
	if (amount <= 0) return;

	const source = context.getImageData(0, 0, width, height);
	const result = context.createImageData(width, height);
	const src = source.data;
	const dst = result.data;
	const center = 1 + 4 * amount;
	const edge = -amount;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const i = (y * width + x) * 4;
			for (let c = 0; c < 3; c += 1) {
				const current = src[i + c] * center;
				const left = src[(y * width + Math.max(0, x - 1)) * 4 + c] * edge;
				const right = src[(y * width + Math.min(width - 1, x + 1)) * 4 + c] * edge;
				const top = src[(Math.max(0, y - 1) * width + x) * 4 + c] * edge;
				const bottom = src[(Math.min(height - 1, y + 1) * width + x) * 4 + c] * edge;
				dst[i + c] = clamp({ value: Math.round(current + left + right + top + bottom), min: 0, max: 255 });
			}
			dst[i + 3] = src[i + 3];
		}
	}

	context.putImageData(result, 0, 0);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp({ value: (value - edge0) / (edge1 - edge0), min: 0, max: 1 });
	return t * t * (3 - 2 * t);
}

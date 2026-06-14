import type { RetimeConfig } from "@/opencut-classic/timeline";
import { clampRetimeRate } from "@/opencut-classic/retime/rate";

export function buildConstantRetime({
	rate,
	maintainPitch = false,
}: {
	rate: number;
	maintainPitch?: boolean;
}): RetimeConfig {
	return { rate: clampRetimeRate({ rate }), maintainPitch };
}

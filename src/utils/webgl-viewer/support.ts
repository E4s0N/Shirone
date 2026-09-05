/**
 * WebGL 查看器的运行环境探测与渲染常量。
 */

export const RENDER_CONFIG = {
	/** 渲染节流间隔（约 60fps） */
	THROTTLE_MS: 16,
	/** 单张纹理上传的像素预算上限 */
	MAX_TEXTURE_UPLOAD_PIXELS: 12000 * 12000,
	/** 启用瓦片渲染时允许的总像素预算 */
	MAX_TILE_TOTAL_PIXELS: 12000 * 12000 * 2,
	/** 纹理上传失败时的最大重试次数 */
	TEXTURE_RETRY_LIMIT: 3,
	/** 纹理上传失败时的降采样系数 */
	TEXTURE_RETRY_SCALE_FACTOR: 0.75,
	/** 双击检测间隔（ms） */
	DOUBLE_CLICK_DELAY: 300,
} as const;

/** easeOutQuart：与 M3 emphasized-decelerate 近似的 JS 补间曲线 */
export function easeOutQuart(t: number): number {
	return 1 - (1 - t) ** 4;
}

export function checkWebGLSupport(): boolean {
	if (typeof document === "undefined") return false;
	try {
		const canvas = document.createElement("canvas");
		return Boolean(canvas.getContext("webgl"));
	} catch {
		return false;
	}
}

export function getMaxTextureSize(gl: WebGLRenderingContext): number {
	const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
	return typeof max === "number" && max > 0 ? max : 4096;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function throttle<Args extends unknown[]>(
	func: (...args: Args) => void,
	wait: number,
): (...args: Args) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let lastArgs: Args | null = null;

	const invoke = () => {
		if (lastArgs) {
			const args: Args = lastArgs;
			lastArgs = null;
			timeout = setTimeout(invoke, wait);
			func(...args);
		} else {
			timeout = null;
		}
	};

	return (...args: Args) => {
		lastArgs = args;
		if (timeout === null) {
			timeout = setTimeout(invoke, wait);
		}
	};
}

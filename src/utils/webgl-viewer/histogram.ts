/**
 * 直方图采样（纯函数，Worker 与主线程共用）。
 * 128 bin，与 chronoframe 的 256bin 压缩版对齐；灰度用 BT.601 加权。
 */

export const HISTOGRAM_BINS = 128;

/** 采样画布的最大边长：够画直方图即可，避免大图逐像素开销 */
export const HISTOGRAM_SAMPLE = 256;

export interface HistogramData {
	red: number[];
	green: number[];
	blue: number[];
	gray: number[];
}

export function histogramFromImageData(data: {
	data: Uint8ClampedArray | Uint8Array;
}): HistogramData {
	const red = new Array<number>(HISTOGRAM_BINS).fill(0);
	const green = new Array<number>(HISTOGRAM_BINS).fill(0);
	const blue = new Array<number>(HISTOGRAM_BINS).fill(0);
	const gray = new Array<number>(HISTOGRAM_BINS).fill(0);

	const pixels = data.data;
	// 每 4 个像素取 1 个采样，进一步降低大图开销且不影响形状
	for (let i = 0; i < pixels.length; i += 16) {
		const r = pixels[i] as number;
		const g = pixels[i + 1] as number;
		const b = pixels[i + 2] as number;
		red[r >> 1] += 1;
		green[g >> 1] += 1;
		blue[b >> 1] += 1;
		gray[Math.round(0.299 * r + 0.587 * g + 0.114 * b) >> 1] += 1;
	}

	return { red, green, blue, gray };
}

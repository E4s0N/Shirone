/// <reference lib="webworker" />
/**
 * 图片解码 Worker：fetch → blob → createImageBitmap，
 * 以 transferable 传回主线程，避免大图解码阻塞 UI。
 * 顺带就地解析 EXIF（exifr）并采样 128bin RGB 直方图——
 * 字节已在手，零额外网络请求；任一失败互不影响，字段省略即可。
 * 取图结果（blob + EXIF + 直方图）按 src 做 LRU 缓存：来回切换已看过的
 * 照片不再重新下载；新 load 到来时中断上一次未完成的 fetch，
 * 快速切换不互相抢占带宽。preload 消息只预热缓存不做解码，
 * 供查看器预取相邻照片。
 * 通过 new Worker(new URL("./worker.ts", import.meta.url)) 由 Vite 打包。
 */

import exifr from "exifr";
import { HISTOGRAM_SAMPLE, histogramFromImageData } from "./histogram";
import type { ExifSummary, HistogramData } from "./types";

const workerScope = self as unknown as {
	onmessage: ((event: MessageEvent) => void) | null;
	postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

interface ParsedExif {
	Make?: string;
	Model?: string;
	Artist?: string;
	LensMake?: string;
	LensModel?: string;
	FocalLength?: number;
	FocalLengthIn35mmFormat?: number;
	MaxApertureValue?: number;
	FNumber?: number;
	ExposureTime?: number;
	ISO?: number;
	DateTimeOriginal?: Date | string;
	ModifyDate?: Date | string;
	ExposureProgram?: string | number;
	MeteringMode?: string | number;
	WhiteBalance?: string | number;
	Flash?: string | number;
	ColorSpace?: number | string;
	Software?: string;
	latitude?: number;
	longitude?: number;
}

/**
 * EXIF 时间无时区语义，exifr（默认 reviveValues）解析为按 UTC 计的 Date，
 * 取 UTC 分量即是相机记录的原始墙上时间，避免被本地时区平移。
 * 拍摄时间优先 DateTimeOriginal，缺失时回退 ModifyDate。
 */
function exifDateString(value: Date | string | undefined): string | undefined {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return undefined;
		return value.toISOString().slice(0, 16).replace("T", " ");
	}
	if (typeof value === "string" && value.trim()) return value.trim();
	return undefined;
}

/** 枚举字段：exifr translateValues 已转成可读字符串才采用，原始数字跳过 */
function enumString(value: string | number | undefined): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeExif(
	parsed: ParsedExif | null | undefined,
): ExifSummary | undefined {
	if (!parsed) return undefined;
	const camera = [parsed.Make, parsed.Model]
		.filter((part): part is string => Boolean(part))
		.join(" ")
		.trim();
	const lens = [parsed.LensMake, parsed.LensModel]
		.filter((part): part is string => Boolean(part))
		.join(" ")
		.trim();
	const colorSpaceRaw = parsed.ColorSpace;
	const colorSpace =
		colorSpaceRaw === 1 || colorSpaceRaw === "sRGB"
			? "sRGB"
			: colorSpaceRaw === 65535 || colorSpaceRaw === 0xffff
				? "Adobe RGB"
				: typeof colorSpaceRaw === "string" && colorSpaceRaw
					? colorSpaceRaw
					: undefined;

	const summary: ExifSummary = {
		camera: camera || undefined,
		lens: lens || undefined,
		artist: enumString(parsed.Artist),
		focalLength:
			typeof parsed.FocalLength === "number" ? parsed.FocalLength : undefined,
		focalLength35:
			typeof parsed.FocalLengthIn35mmFormat === "number"
				? parsed.FocalLengthIn35mmFormat
				: undefined,
		maxAperture:
			typeof parsed.MaxApertureValue === "number"
				? parsed.MaxApertureValue
				: undefined,
		fNumber: typeof parsed.FNumber === "number" ? parsed.FNumber : undefined,
		exposureTime:
			typeof parsed.ExposureTime === "number" ? parsed.ExposureTime : undefined,
		iso: typeof parsed.ISO === "number" ? parsed.ISO : undefined,
		dateTaken:
			exifDateString(parsed.DateTimeOriginal) ??
			exifDateString(parsed.ModifyDate),
		colorSpace,
		software: enumString(parsed.Software),
		exposureProgram: enumString(parsed.ExposureProgram),
		meteringMode: enumString(parsed.MeteringMode),
		whiteBalance: enumString(parsed.WhiteBalance),
		flash: enumString(parsed.Flash),
		latitude: typeof parsed.latitude === "number" ? parsed.latitude : undefined,
		longitude:
			typeof parsed.longitude === "number" ? parsed.longitude : undefined,
	};

	const hasAny = Object.values(summary).some((value) => value !== undefined);
	return hasAny ? summary : undefined;
}

/** OffscreenCanvas 采样缩小图并统计直方图（Worker 内无 DOM canvas） */
function computeHistogram(image: ImageBitmap): HistogramData | undefined {
	const scale = HISTOGRAM_SAMPLE / Math.max(image.width, image.height);
	const width = Math.max(1, Math.round(image.width * Math.min(scale, 1)));
	const height = Math.max(1, Math.round(image.height * Math.min(scale, 1)));

	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return undefined;
	ctx.drawImage(image, 0, 0, width, height);
	return histogramFromImageData(ctx.getImageData(0, 0, width, height));
}

// ------------------------------------------------------------ 取图缓存

/** 取图结果：blob 供重新解码，EXIF/直方图/大小只解析一次 */
interface FetchEntry {
	blob: Blob;
	exif?: ExifSummary;
	histogram?: HistogramData;
	fileSize: number;
}

const BLOB_CACHE_LIMIT = 6;
/** src → 取图 Promise（在飞请求天然去重）；Map 插入序即 LRU 淘汰序 */
const blobCache = new Map<string, Promise<FetchEntry>>();
/** 当前在飞的 load 取图控制器：新 load 到来时中断旧 fetch */
let activeLoadController: AbortController | null = null;
let activeLoadSrc: string | null = null;

function touchCache(src: string, entry: Promise<FetchEntry>): void {
	blobCache.delete(src);
	blobCache.set(src, entry);
	if (blobCache.size > BLOB_CACHE_LIMIT) {
		const oldest = blobCache.keys().next().value;
		if (oldest !== undefined) blobCache.delete(oldest);
	}
}

async function fetchEntry(
	src: string,
	signal?: AbortSignal,
): Promise<FetchEntry> {
	const response = await fetch(src, { mode: "cors", signal });
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status}`);
	}
	const blob = await response.blob();

	// EXIF 与直方图解析失败不影响图片本身的展示
	let exif: ExifSummary | undefined;
	let histogram: HistogramData | undefined;
	try {
		const parsed = (await exifr.parse(await blob.arrayBuffer(), {
			tiff: true,
			ifd0: {},
			exif: {},
			gps: true,
		})) as ParsedExif | null;
		exif = normalizeExif(parsed);
	} catch {
		/* 该格式无 EXIF 或解析失败 */
	}
	try {
		const bitmap = await createImageBitmap(blob);
		histogram = computeHistogram(bitmap);
		bitmap.close();
	} catch {
		/* OffscreenCanvas 不可用或采样失败 */
	}

	return { blob, exif, histogram, fileSize: blob.size };
}

function getEntry(src: string, signal?: AbortSignal): Promise<FetchEntry> {
	const cached = blobCache.get(src);
	if (cached) {
		// 命中缓存即刷新 LRU 位次
		blobCache.delete(src);
		blobCache.set(src, cached);
		return cached;
	}
	const entry = fetchEntry(src, signal).catch((error: unknown) => {
		blobCache.delete(src);
		throw error;
	});
	touchCache(src, entry);
	return entry;
}

workerScope.onmessage = async (event: MessageEvent) => {
	const { type, payload } = event.data;

	if (type === "preload") {
		// 邻图预热：只取字节入缓存，不解码不回包；失败静默（用到时正常报错）
		if (typeof payload?.src === "string") {
			void getEntry(payload.src).catch(() => {});
		}
		return;
	}

	if (type !== "load") return;

	// 中断上一次尚未完成的取图：快速切换时旧请求本就是过期代际，直接让路
	if (activeLoadController && activeLoadSrc !== payload.src) {
		activeLoadController.abort();
	}
	const controller = new AbortController();
	activeLoadController = controller;
	activeLoadSrc = payload.src;

	try {
		const entry = await getEntry(payload.src, controller.signal);
		const imageBitmap = await createImageBitmap(entry.blob);
		workerScope.postMessage(
			{
				type: "loaded",
				payload: {
					imageBitmap,
					requestId: payload.requestId,
					exif: entry.exif,
					histogram: entry.histogram,
					fileSize: entry.fileSize,
				},
			},
			[imageBitmap],
		);
	} catch (error) {
		// 被更新的请求中断：静默让路，不回错误包
		if (error instanceof Error && error.name === "AbortError") return;
		workerScope.postMessage({
			type: "load-error",
			payload: {
				message:
					error instanceof Error ? error.message : "Unknown error",
				requestId: payload.requestId,
			},
		});
	} finally {
		if (activeLoadController === controller) {
			activeLoadController = null;
			activeLoadSrc = null;
		}
	}
};

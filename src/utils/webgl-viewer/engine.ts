/**
 * WebGL 图片查看器引擎（框架无关）。
 * 移植自 webgl-image 的 WebGLImageViewerEngine，裁剪为 Shirone 所需子集：
 * 整图纹理 + 超大图瓦片两条渲染路径、Worker 离线解码（含主线程回退）、
 * 拖拽/滚轮/双指/双击交互、边界约束与 easeOutQuart 补间。
 * 交互状态下图像不参与 DOM 变换，全部通过 uniform 矩阵在 GPU 上绘制。
 */

import { HISTOGRAM_SAMPLE, histogramFromImageData } from "./histogram";
import { createProgram } from "./shaders";
import {
	clamp,
	easeInOutCubic,
	easeOutQuart,
	getMaxTextureSize,
	RENDER_CONFIG,
	throttle,
} from "./support";
import type {
	Animation,
	ExifSummary,
	HistogramData,
	ImageSource,
	Tile,
	Transform,
	ViewerCallbacks,
	ViewerEngineConfig,
	ViewerMetadata,
} from "./types";

const DEFAULT_CONFIG: ViewerEngineConfig = {
	minScale: 0.1,
	maxScale: 10,
	wheelStep: 0.1,
	doubleClickStep: 2,
	animationTime: 250,
	tileEnabled: true,
	tileSize: 1024,
	limitToBounds: true,
	centerOnInit: true,
};

/** 邻图就绪纹理：按视口尺寸降采样，供翻页拖拽无缝衔接 */
interface NeighborAsset {
	texture: WebGLTexture;
	quad: { w: number; h: number; tx: number; ty: number };
	source: ImageSource;
	meta: ViewerMetadata;
	/** 来自全图解码（true）或缩略图兜底（false）；清晰版到位后覆盖兜底版 */
	crisp: boolean;
}

/** 翻页拖拽状态：未放大时单指拖动，当前图与邻图并排跟手 */
interface PagerState {
	/** 1 = 邻图在右侧（下一张），-1 = 左侧（上一张），0 = 无邻图（仅阻尼回弹） */
	direction: 1 | -1 | 0;
	/** 跟手位移（canvas 设备像素） */
	dx: number;
	/** 拖出的邻图 src（0 方向时为 null）；纹理查 readyNeighbors */
	src: string | null;
	requestId: number;
	animating: boolean;
	target: number;
	/** 最近位移采样（用于计算轻扫速度） */
	history: Array<{ dx: number; t: number }>;
}

const DOUBLE_TAP_SLOP_PX = 50;

export class WebGLImageViewerEngine {
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private config: ViewerEngineConfig;
	private callbacks: ViewerCallbacks;

	private image: ImageSource | null = null;
	private texture: WebGLTexture | null = null;
	private program: WebGLProgram | null = null;
	private tiles: Tile[] = [];
	private useTiles = false;

	private worker: Worker | null = null;
	private imageLoadingResolve: (() => void) | null = null;
	private imageLoadingReject: ((error: Error) => void) | null = null;

	private transform: Transform = { scale: 1, translateX: 0, translateY: 0 };
	private initialScale = 1;

	private animation: Animation | null = null;
	private animationId: number | null = null;

	private isDragging = false;
	private lastMousePos: { x: number; y: number } | null = null;
	private touchState: {
		lastDistance: number;
	} | null = null;
	/** 当前触控手势的起点（第一根手指落下处），用于滑动切换判定 */
	private touchGestureStart: { x: number; y: number } | null = null;
	/** 本次手势中出现过双指缩放：缩放过的手势不触发滑动切换 */
	private touchGesturePinched = false;

	// ------------------------------------------------------------ 翻页拖拽

	private neighborSrcs: { prev: string | null; next: string | null } = {
		prev: null,
		next: null,
	};
	/** 已解码的邻图纹理（src → 资产），加载完成后预 warm，拖拽即取即用 */
	private readyNeighbors = new Map<string, NeighborAsset>();
	/** 在飞的邻图解码请求：requestId → src */
	private neighborRequests = new Map<number, string>();
	/** 当前照片的缩略图预览纹理（加载期间画布的可视内容，可跟手翻页） */
	private preview: {
		src: string;
		texture: WebGLTexture;
		quad: { w: number; h: number; tx: number; ty: number };
	} | null = null;
	private pager: PagerState | null = null;
	private pagerRequestCounter = 0;
	private pagerRafId: number | null = null;
	private pagerLastMove: { x: number; t: number } | null = null;
	private lastClickTime = 0;
	private lastTouchTime = 0;
	private lastTouchPosition: { x: number; y: number } | null = null;
	private hasMoved = false;

	private positionBuffer: WebGLBuffer | null = null;
	private texCoordBuffer: WebGLBuffer | null = null;
	private positionLocation = -1;
	private texCoordLocation = -1;
	private matrixLocation: WebGLUniformLocation | null = null;
	private resolutionLocation: WebGLUniformLocation | null = null;
	private imageLocation: WebGLUniformLocation | null = null;

	private loaded = false;
	private requestCounter = 0;
	private currentRequestId = 0;
	private lastRequestedSrc: string | null = null;

	private throttledRender: () => void;
	private resizeObserver: ResizeObserver | null = null;
	private resizeFrameId: number | null = null;

	// 绑定后的处理器引用，destroy 时成对移除（含 document 级监听）
	private boundHandlers: Array<[EventTarget, string, EventListener]> = [];

	constructor(
		canvas: HTMLCanvasElement,
		config: Partial<ViewerEngineConfig> = {},
		callbacks: ViewerCallbacks = {},
	) {
		this.canvas = canvas;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.callbacks = callbacks;

		const gl = canvas.getContext("webgl", {
			alpha: true,
			antialias: true,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: false,
		});
		if (!gl) {
			throw new Error("WebGL not supported");
		}
		this.gl = gl;

		this.throttledRender = throttle(
			() => this.render(),
			RENDER_CONFIG.THROTTLE_MS,
		);
		this.setupWebGL();
		this.setupWorker();
		this.setupEventListeners();
		this.setupResizeObserver();
		this.resize();
	}

	// ------------------------------------------------------------ 初始化

	private setupWebGL(): void {
		const { gl } = this;
		this.program = createProgram(gl);
		if (!this.program) {
			throw new Error("Failed to create shader program");
		}

		gl.useProgram(this.program);
		this.positionLocation = gl.getAttribLocation(this.program, "a_position");
		this.texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
		this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
		this.resolutionLocation = gl.getUniformLocation(
			this.program,
			"u_resolution",
		);
		this.imageLocation = gl.getUniformLocation(this.program, "u_image");

		this.positionBuffer = gl.createBuffer();
		this.texCoordBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
			gl.STATIC_DRAW,
		);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.clearColor(0, 0, 0, 0);
	}

	private setupWorker(): void {
		if (typeof Worker === "undefined") return;
		try {
			this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
				type: "module",
				name: "webgl-image-decoder",
			});
		} catch {
			// Worker 创建失败时退回主线程解码
			this.worker = null;
			return;
		}

		this.worker.onmessage = (event: MessageEvent) => {
			const { type, payload } = event.data;
			if (!this.isCurrentRequest(payload?.requestId)) return;
			if (type === "progress") {
				this.callbacks.onProgress?.(
					Number(payload.loaded) || 0,
					Number(payload.total) || 0,
				);
				return;
			}
			if (type === "neighbor") {
				this.applyNeighborBitmap(payload);
				return;
			}
			if (type === "neighbor-error") {
				this.neighborRequests.delete(payload?.requestId);
				return;
			}
			if (type === "loaded") {
				const rendered = this.applyDecodedImage(payload.imageBitmap);
				if (rendered) {
					this.callbacks.onMetadata?.({
						exif: payload.exif,
						histogram: payload.histogram,
						fileSize: payload.fileSize,
						width: payload.imageBitmap.width,
						height: payload.imageBitmap.height,
					});
					this.resolvePendingImageLoad();
				} else {
					void this.decodeOnMainThread();
				}
			} else if (type === "load-error") {
				void this.decodeOnMainThread();
			}
		};
		this.worker.onerror = () => {
			void this.decodeOnMainThread();
		};
	}

	private addListener<T extends Event>(
		target: EventTarget,
		type: string,
		handler: (event: T) => void,
		options?: AddEventListenerOptions,
	): void {
		target.addEventListener(type, handler as EventListener, options);
		this.boundHandlers.push([target, type, handler as EventListener]);
	}

	private setupEventListeners(): void {
		this.addListener(this.canvas, "mousedown", this.onMouseDown);
		this.addListener(this.canvas, "wheel", this.onWheel, { passive: false });
		this.addListener(this.canvas, "click", this.onClick);
		this.addListener(this.canvas, "touchstart", this.onTouchStart, {
			passive: false,
		});
		this.addListener(this.canvas, "touchmove", this.onTouchMove, {
			passive: false,
		});
		this.addListener(this.canvas, "touchend", this.onTouchEnd, {
			passive: false,
		});
		this.addListener(this.canvas, "webglcontextlost", this.onContextLost);
		this.addListener(
			this.canvas,
			"webglcontextrestored",
			this.onContextRestored,
		);
		this.addListener(this.canvas, "contextmenu", (event) =>
			event.preventDefault(),
		);
	}

	private setupResizeObserver(): void {
		this.resizeObserver = new ResizeObserver(() => {
			if (this.resizeFrameId !== null) {
				cancelAnimationFrame(this.resizeFrameId);
			}
			this.resizeFrameId = requestAnimationFrame(() => {
				this.resizeFrameId = null;
				this.resize();
			});
		});
		this.resizeObserver.observe(this.canvas);
	}

	// ------------------------------------------------------------ 图片加载

	public loadImage(src: string): Promise<void> {
		this.lastRequestedSrc = src;
		// 请求代际：快速切换图片时丢弃过期回包
		const requestId = ++this.requestCounter;
		this.currentRequestId = requestId;
		// 丢弃上一张的画面：切换加载期间 render 只清屏不绘制旧图，
		// 残影交给缩略图占位层替代
		this.loaded = false;
		this.cancelPager();
		this.clearPreview();
		this.render();
		this.callbacks.onLoadChange?.(true, false);

		return new Promise((resolve, reject) => {
			this.imageLoadingResolve = resolve;
			this.imageLoadingReject = reject;

			if (this.worker) {
				this.worker.postMessage({
					type: "load",
					payload: {
						src: new URL(src, self.location.origin).toString(),
						requestId,
					},
				});
			} else {
				void this.decodeOnMainThread();
			}
		});
	}

	private isCurrentRequest(requestId: unknown): boolean {
		return requestId === undefined || requestId === this.currentRequestId;
	}

	/** 预热相邻照片：Worker 内只取字节入缓存，不解码；切换到时省去下载等待 */
	public preload(src: string): void {
		if (!this.worker) return;
		this.worker.postMessage({
			type: "preload",
			payload: { src: new URL(src, self.location.origin).toString() },
		});
	}

	/**
	 * 桌面端点击切换：以翻页动画滑向相邻照片。
	 * 返回 true 表示动画已启动（结束时引擎触发 onPageChange）；
	 * 返回 false 表示无法动画（加载中/纹理未预热），宿主应走淡出切换。
	 */
	public pageTo(direction: 1 | -1): boolean {
		if (!this.worker || !this.loaded) return false;
		if (this.pager?.animating) this.finishPagerAnimation();
		if (this.pager) return false;
		const src =
			direction === 1 ? this.neighborSrcs.next : this.neighborSrcs.prev;
		if (!src) return false;
		if (!this.readyNeighbors.get(src)) {
			this.requestNeighborDecode(src);
			return false;
		}
		this.pager = {
			direction,
			dx: 0,
			src,
			requestId: ++this.pagerRequestCounter,
			animating: false,
			target: 0,
			history: [],
		};
		this.animatePagerTo(-direction * this.canvas.width, {
			duration: RENDER_CONFIG.PAGER_ANIMATE_MS,
			easing: easeInOutCubic,
		});
		return true;
	}

	/** 告知相邻照片的 src：预解码邻图纹理（通常命中 blob 缓存），翻页拖拽即取即用 */
	public updateNeighbors(
		prev: string | null,
		next: string | null,
		images?: { prev?: HTMLImageElement; next?: HTMLImageElement },
	): void {
		this.neighborSrcs = { prev, next };
		const wanted = new Set<string>();
		if (prev) wanted.add(prev);
		if (next) wanted.add(next);
		// 丢弃不再是邻图的就绪纹理
		for (const [src, asset] of this.readyNeighbors) {
			if (!wanted.has(src)) {
				this.gl.deleteTexture(asset.texture);
				this.readyNeighbors.delete(src);
			}
		}
		for (const src of wanted) {
			const existing = this.readyNeighbors.get(src);
			if (existing?.crisp) continue; // 已有清晰纹理
			// 缩略图即时建纹理兜底（秒出），解码完成后被更清晰的纹理覆盖
			if (src === prev && images?.prev) {
				this.ensureNeighborThumbAsset(src, images.prev);
			} else if (src === next && images?.next) {
				this.ensureNeighborThumbAsset(src, images.next);
			}
			if (!this.readyNeighbors.get(src)?.crisp) {
				this.requestNeighborDecode(src);
			}
		}
	}

	/** 用缩略图立即构建邻图纹理；解码完成后会被更清晰的纹理覆盖 */
	private ensureNeighborThumbAsset(
		src: string,
		image: HTMLImageElement,
	): void {
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) {
			image.addEventListener(
				"load",
				() => this.ensureNeighborThumbAsset(src, image),
				{ once: true },
			);
			return;
		}
		const built = this.uploadFittedTexture(image, naturalWidth, naturalHeight);
		if (!built) return;
		// 异步构建期间可能已不再是邻图
		if (src !== this.neighborSrcs.prev && src !== this.neighborSrcs.next) {
			this.gl.deleteTexture(built.texture);
			return;
		}
		const existing = this.readyNeighbors.get(src);
		if (existing) this.gl.deleteTexture(existing.texture);
		this.readyNeighbors.set(src, {
			texture: built.texture,
			quad: built.quad,
			source: built.resized,
			meta: { width: naturalWidth, height: naturalHeight },
			crisp: false,
		});
		this.render();
	}

	/** 提供当前照片的缩略图作为加载期间的画布预览（全分辨率就绪后自动释放） */
	public setPreview(src: string, image: HTMLImageElement): void {
		if (!this.program) return;
		if (this.preview?.src === src) return;
		if (this.loaded && this.lastRequestedSrc === src) return;
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) return;
		const built = this.uploadFittedTexture(image, naturalWidth, naturalHeight);
		if (!built) return;
		this.clearPreview();
		this.preview = { src, texture: built.texture, quad: built.quad };
		if (!this.loaded) this.render();
	}

	private clearPreview(): void {
		if (this.preview) {
			this.gl.deleteTexture(this.preview.texture);
			this.preview = null;
		}
	}

	/** 把任意图像源按视口适配尺寸缩放并上传为纹理 */
	private uploadFittedTexture(
		source: CanvasImageSource,
		sourceWidth: number,
		sourceHeight: number,
	): {
		texture: WebGLTexture;
		quad: { w: number; h: number; tx: number; ty: number };
		resized: HTMLCanvasElement;
	} | null {
		const fit = Math.min(
			this.canvas.width / sourceWidth,
			this.canvas.height / sourceHeight,
		);
		const width = Math.max(1, Math.round(sourceWidth * fit));
		const height = Math.max(1, Math.round(sourceHeight * fit));
		const resized = this.resizeSource(source, width, height);
		if (!resized) return null;
		const texture = this.gl.createTexture();
		if (!texture) return null;
		const { gl } = this;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			resized,
		);
		if (gl.getError() !== gl.NO_ERROR) {
			gl.deleteTexture(texture);
			return null;
		}
		return {
			texture,
			quad: {
				w: width,
				h: height,
				tx: (this.canvas.width - width) / 2,
				ty: (this.canvas.height - height) / 2,
			},
			resized,
		};
	}

	/** 邻图纹理已预热但解码仍在飞时去重 */
	private requestNeighborDecode(src: string): void {
		if (!this.worker) return;
		for (const pending of this.neighborRequests.values()) {
			if (pending === src) return;
		}
		const requestId = ++this.pagerRequestCounter;
		this.neighborRequests.set(requestId, src);
		this.worker.postMessage({
			type: "decode-neighbor",
			payload: {
				src: new URL(src, self.location.origin).toString(),
				requestId,
			},
		});
	}

	/**
	 * 静默升级当前照片到全分辨率（翻页提交后调用）：
	 * 不清屏、不触发加载状态，新纹理就绪后原位替换。
	 */
	public refreshCurrent(src: string): void {
		if (!this.worker) return;
		const requestId = ++this.requestCounter;
		this.currentRequestId = requestId;
		this.worker.postMessage({
			type: "load",
			payload: {
				src: new URL(src, self.location.origin).toString(),
				requestId,
				silent: true,
			},
		});
	}

	// 主线程回退解码（Worker 不可用或解码失败时）
	private async decodeOnMainThread(): Promise<void> {
		const src = this.lastRequestedSrc;
		if (!src) {
			this.rejectPendingImageLoad(new Error("No image source available"));
			return;
		}
		const requestId = this.currentRequestId;
		this.callbacks.onLoadChange?.(true, false);
		try {
			const image = await new Promise<HTMLImageElement>((resolve, reject) => {
				const img = new Image();
				img.crossOrigin = "anonymous";
				img.decoding = "async";
				img.onload = () => resolve(img);
				img.onerror = () => reject(new Error("Failed to decode image"));
				img.src = src;
			});
			// 解码期间用户已切换到其他图片：丢弃本次结果
			if (requestId !== this.currentRequestId) return;
			const rendered = this.applyDecodedImage(image);
			if (!rendered) {
				throw new Error("Failed to render decoded image");
			}
			// 主线程回退路径没有 Worker 的 EXIF 解析，仅采样直方图
			this.callbacks.onMetadata?.({
				histogram: this.computeHistogramOnMainThread(image),
				width: image.width,
				height: image.height,
			});
			this.resolvePendingImageLoad();
		} catch (error) {
			if (requestId !== this.currentRequestId) return;
			this.rejectPendingImageLoad(error);
		}
	}

	private resolvePendingImageLoad(): void {
		const resolve = this.imageLoadingResolve;
		this.imageLoadingResolve = null;
		this.imageLoadingReject = null;
		resolve?.();
	}

	private rejectPendingImageLoad(error: unknown): void {
		const reject = this.imageLoadingReject;
		this.imageLoadingResolve = null;
		this.imageLoadingReject = null;
		this.callbacks.onLoadChange?.(false, true);
		reject?.(
			error instanceof Error ? error : new Error("Unknown image load error"),
		);
	}

	private applyDecodedImage(source: ImageSource): boolean {
		const dimensions = this.getSourceDimensions(source);
		if (!dimensions) return false;

		// 全分辨率就绪：加载期缩略图预览纹理不再需要
		this.clearPreview();

		this.image = source;
		this.loaded = true;

		let usingTiles = false;
		if (this.shouldUseTiles(dimensions)) {
			usingTiles = this.createTiles(source);
		}

		if (!usingTiles) {
			this.cleanupTiles();
			if (this.createTexture(source) === null) {
				this.image = null;
				this.loaded = false;
				return false;
			}
		} else if (this.texture) {
			this.gl.deleteTexture(this.texture);
			this.texture = null;
		}
		this.useTiles = usingTiles;

		if (this.config.centerOnInit) {
			this.centerImage();
		}

		this.callbacks.onLoadChange?.(false, false);
		this.render();
		return true;
	}

	/** 主线程直方图采样（Worker 不可用时的回退）；跨域无 CORS 时 getImageData 会抛错，按无直方图处理 */
	private computeHistogramOnMainThread(
		source: ImageSource,
	): HistogramData | undefined {
		if (typeof document === "undefined" || !source.width || !source.height) {
			return undefined;
		}
		try {
			const scale = Math.min(
				1,
				HISTOGRAM_SAMPLE / Math.max(source.width, source.height),
			);
			const width = Math.max(1, Math.round(source.width * scale));
			const height = Math.max(1, Math.round(source.height * scale));
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) return undefined;
			ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
			return histogramFromImageData(ctx.getImageData(0, 0, width, height));
		} catch {
			return undefined;
		}
	}

	private getSourceDimensions(source: {
		width: number;
		height: number;
	}): { width: number; height: number } | null {
		const { width, height } = source;
		if (
			!Number.isFinite(width) ||
			!Number.isFinite(height) ||
			width <= 0 ||
			height <= 0
		) {
			return null;
		}
		return { width, height };
	}

	// ------------------------------------------------------------ 纹理

	private createTexture(source: ImageSource): WebGLTexture | null {
		const { gl } = this;

		if (this.texture) {
			gl.deleteTexture(this.texture);
			this.texture = null;
		}

		const dimensions = this.getSourceDimensions(source);
		if (!dimensions) return null;

		const maxTextureSize = getMaxTextureSize(gl);
		const maxPixels = Math.min(
			RENDER_CONFIG.MAX_TEXTURE_UPLOAD_PIXELS,
			maxTextureSize * maxTextureSize,
		);
		const sourcePixels = dimensions.width * dimensions.height;

		let targetWidth = dimensions.width;
		let targetHeight = dimensions.height;
		if (sourcePixels > maxPixels) {
			const scale = Math.sqrt(maxPixels / sourcePixels);
			targetWidth = Math.max(1, Math.floor(dimensions.width * scale));
			targetHeight = Math.max(1, Math.floor(dimensions.height * scale));
		}
		if (
			dimensions.width > maxTextureSize ||
			dimensions.height > maxTextureSize
		) {
			const scale = Math.min(
				maxTextureSize / dimensions.width,
				maxTextureSize / dimensions.height,
			);
			targetWidth = Math.max(1, Math.floor(targetWidth * scale));
			targetHeight = Math.max(1, Math.floor(targetHeight * scale));
		}

		let uploadSource: ImageSource = source;
		if (
			targetWidth !== dimensions.width ||
			targetHeight !== dimensions.height
		) {
			const resized = this.resizeSource(source, targetWidth, targetHeight);
			if (resized) uploadSource = resized;
		}

		let attempt = 0;
		while (attempt < RENDER_CONFIG.TEXTURE_RETRY_LIMIT) {
			const texture = gl.createTexture();
			if (!texture) break;

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

			let uploadError: unknown = null;
			try {
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					uploadSource,
				);
			} catch (error) {
				uploadError = error;
			}

			if (!uploadError && gl.getError() === gl.NO_ERROR) {
				this.texture = texture;
				this.image = uploadSource;
				this.updatePositionBuffer();
				gl.bindTexture(gl.TEXTURE_2D, null);
				return texture;
			}

			gl.deleteTexture(texture);
			gl.bindTexture(gl.TEXTURE_2D, null);

			const current = this.getSourceDimensions(uploadSource);
			if (!current) break;
			const retryWidth = Math.max(
				1,
				Math.floor(current.width * RENDER_CONFIG.TEXTURE_RETRY_SCALE_FACTOR),
			);
			const retryHeight = Math.max(
				1,
				Math.floor(current.height * RENDER_CONFIG.TEXTURE_RETRY_SCALE_FACTOR),
			);
			if (retryWidth >= current.width && retryHeight >= current.height) break;
			const resized = this.resizeSource(uploadSource, retryWidth, retryHeight);
			if (!resized) break;
			uploadSource = resized;
			attempt += 1;
		}

		return null;
	}

	private resizeSource(
		source: CanvasImageSource,
		width: number,
		height: number,
	): HTMLCanvasElement | null {
		const offscreen = document.createElement("canvas");
		offscreen.width = width;
		offscreen.height = height;
		const ctx = offscreen.getContext("2d");
		if (!ctx) return null;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(source, 0, 0, width, height);
		return offscreen;
	}

	private shouldUseTiles(dimensions: {
		width: number;
		height: number;
	}): boolean {
		if (!this.config.tileEnabled) return false;
		if (
			dimensions.width * dimensions.height >
			RENDER_CONFIG.MAX_TILE_TOTAL_PIXELS
		) {
			return false;
		}
		const maxTextureSize = getMaxTextureSize(this.gl);
		if (
			dimensions.width > maxTextureSize ||
			dimensions.height > maxTextureSize
		) {
			return true;
		}
		return (
			dimensions.width > this.config.tileSize ||
			dimensions.height > this.config.tileSize
		);
	}

	private createTiles(source: ImageSource): boolean {
		const { gl } = this;
		this.cleanupTiles();

		const dimensions = this.getSourceDimensions(source);
		if (!dimensions) return false;

		const tileSize = Math.min(this.config.tileSize, getMaxTextureSize(gl));
		const columns = Math.ceil(dimensions.width / tileSize);
		const rows = Math.ceil(dimensions.height / tileSize);
		const offscreen = document.createElement("canvas");
		const tiles: Tile[] = [];

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < columns; col++) {
				const x = col * tileSize;
				const y = row * tileSize;
				const width = Math.min(tileSize, dimensions.width - x);
				const height = Math.min(tileSize, dimensions.height - y);
				if (width <= 0 || height <= 0) continue;

				offscreen.width = width;
				offscreen.height = height;
				const ctx = offscreen.getContext("2d");
				if (!ctx) {
					this.cleanupTiles();
					return false;
				}
				ctx.drawImage(source, x, y, width, height, 0, 0, width, height);

				const texture = gl.createTexture();
				if (!texture) {
					this.cleanupTiles();
					return false;
				}
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					offscreen,
				);
				tiles.push({ x, y, width, height, texture });
			}
		}
		gl.bindTexture(gl.TEXTURE_2D, null);

		if (!tiles.length) return false;
		this.tiles = tiles;
		this.updatePositionBuffer();
		return true;
	}

	private cleanupTiles(): void {
		for (const tile of this.tiles) {
			if (tile.texture) this.gl.deleteTexture(tile.texture);
		}
		this.tiles = [];
	}

	private getVisibleTiles(): Tile[] {
		if (!this.tiles.length) return [];
		const { scale, translateX, translateY } = this.transform;
		if (!Number.isFinite(scale) || scale <= 0) return this.tiles;

		const viewLeft = -translateX / scale;
		const viewTop = -translateY / scale;
		const viewRight = (this.canvas.width - translateX) / scale;
		const viewBottom = (this.canvas.height - translateY) / scale;

		return this.tiles.filter((tile) => {
			return (
				tile.x + tile.width >= viewLeft &&
				tile.x <= viewRight &&
				tile.y + tile.height >= viewTop &&
				tile.y <= viewBottom
			);
		});
	}

	private updatePositionBuffer(): void {
		if (!this.image || !this.positionBuffer) return;
		const { gl } = this;
		const { width, height } = this.getSourceDimensions(this.image) ?? {
			width: 1,
			height: 1,
		};
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				0,
				0,
				width,
				0,
				0,
				height,
				0,
				height,
				width,
				0,
				width,
				height,
			]),
			gl.STATIC_DRAW,
		);
	}

	// ------------------------------------------------------------ 视图状态

	public resize(): void {
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;

		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (width === this.canvas.width && height === this.canvas.height) return;

		const prevScale = this.transform.scale;
		const prevTranslateX = this.transform.translateX;
		const prevTranslateY = this.transform.translateY;
		const prevInitialScale = this.initialScale;

		this.canvas.width = width;
		this.canvas.height = height;
		this.gl.viewport(0, 0, width, height);

		if (this.image && prevScale > 0 && prevInitialScale > 0) {
			// 保持当前缩放级别与视口中心对应的图像点不变
			const centerImageX = (this.canvas.width / 2 - prevTranslateX) / prevScale;
			const centerImageY =
				(this.canvas.height / 2 - prevTranslateY) / prevScale;

			this.initialScale = this.getFitScale();
			const nextScale = this.clampScale(
				this.initialScale * (prevScale / prevInitialScale),
			);
			this.transform.scale = nextScale;
			this.transform.translateX =
				this.canvas.width / 2 - centerImageX * nextScale;
			this.transform.translateY =
				this.canvas.height / 2 - centerImageY * nextScale;
			this.constrainToBounds();
		}

		if (this.image && (this.texture || this.useTiles)) {
			this.throttledRender();
		}
	}

	private centerImage(): void {
		if (!this.image || this.canvas.width <= 0 || this.canvas.height <= 0)
			return;

		this.initialScale = this.getFitScale();
		const scale = this.clampScale(this.initialScale);
		const scaledWidth = this.image.width * scale;
		const scaledHeight = this.image.height * scale;

		this.transform = {
			scale,
			translateX: (this.canvas.width - scaledWidth) / 2,
			translateY: (this.canvas.height - scaledHeight) / 2,
		};
		this.callbacks.onTransformChange?.({ ...this.transform });
	}

	private constrainToBounds(): void {
		if (!this.config.limitToBounds || !this.image) return;

		const scaledWidth = this.image.width * this.transform.scale;
		const scaledHeight = this.image.height * this.transform.scale;

		if (scaledWidth <= this.canvas.width) {
			this.transform.translateX = (this.canvas.width - scaledWidth) / 2;
		} else {
			this.transform.translateX = clamp(
				this.transform.translateX,
				this.canvas.width - scaledWidth,
				0,
			);
		}

		if (scaledHeight <= this.canvas.height) {
			this.transform.translateY = (this.canvas.height - scaledHeight) / 2;
		} else {
			this.transform.translateY = clamp(
				this.transform.translateY,
				this.canvas.height - scaledHeight,
				0,
			);
		}
	}

	private clampScale(scale: number): number {
		return clamp(
			scale,
			this.initialScale * this.config.minScale,
			this.initialScale * this.config.maxScale,
		);
	}

	private getFitScale(): number {
		if (!this.image || this.canvas.width <= 0 || this.canvas.height <= 0) {
			return this.initialScale;
		}
		const canvasAspect = this.canvas.width / this.canvas.height;
		const imageAspect = this.image.width / this.image.height;
		return imageAspect > canvasAspect
			? this.canvas.width / this.image.width
			: this.canvas.height / this.image.height;
	}

	public getScale(): number {
		return this.transform.scale;
	}

	public getRelativeScale(): number {
		return this.initialScale > 0 ? this.transform.scale / this.initialScale : 1;
	}

	// ------------------------------------------------------------ 渲染

	private render(): void {
		if (!this.program) return;
		if (this.pager) {
			this.renderPagerFrame();
			return;
		}
		const { gl } = this;

		try {
			if (gl.isContextLost()) return;

			if (!this.loaded) {
				// 加载期间：绘制当前照片的缩略图预览（跟随翻页拖拽），无预览则清屏
				if (!this.beginFrame()) return;
				const preview = this.preview;
				if (preview) {
					this.drawQuad(
						preview.texture,
						preview.quad,
						1,
						preview.quad.tx,
						preview.quad.ty,
					);
				}
				return;
			}

			if (!this.texture && !this.useTiles) return;

			this.updateAnimation();

			if (!this.beginFrame()) return;

			gl.uniformMatrix3fv(
				this.matrixLocation,
				false,
				createTransformMatrix(this.transform),
			);

			if (this.useTiles) {
				for (const tile of this.getVisibleTiles()) {
					if (!tile.texture) continue;
					this.drawTileQuad(tile);
				}
			} else if (this.texture) {
				gl.bindTexture(gl.TEXTURE_2D, this.texture);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
			}
		} catch (error) {
			console.error("WebGL viewer render error:", error);
		}
	}

	/** 帧公共设置：清屏、着色器与属性绑定。返回 false 表示无法绘制 */
	private beginFrame(): boolean {
		const { gl } = this;
		if (!this.program || !this.positionBuffer || !this.texCoordBuffer) {
			return false;
		}
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.program);
		gl.uniform2f(
			this.resolutionLocation,
			this.canvas.width,
			this.canvas.height,
		);
		gl.uniform1i(this.imageLocation, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.enableVertexAttribArray(this.texCoordLocation);
		gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.enableVertexAttribArray(this.positionLocation);
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		return true;
	}

	/** 以 scale/平移绘制一张满幅纹理（quad 定义纹理尺寸） */
	private drawQuad(
		texture: WebGLTexture,
		quad: { w: number; h: number },
		scale: number,
		translateX: number,
		translateY: number,
	): void {
		const { gl } = this;
		if (!this.positionBuffer) return;
		gl.uniformMatrix3fv(
			this.matrixLocation,
			false,
			createTransformMatrix({ scale, translateX, translateY }),
		);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				0,
				0,
				quad.w,
				0,
				0,
				quad.h,
				0,
				quad.h,
				quad.w,
				0,
				quad.w,
				quad.h,
			]),
			gl.DYNAMIC_DRAW,
		);
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	/** 绘制单个瓦片四边形（position attrib 由调用方启用） */
	private drawTileQuad(tile: Tile): void {
		const { gl } = this;
		if (!this.positionBuffer) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				tile.x,
				tile.y,
				tile.x + tile.width,
				tile.y,
				tile.x,
				tile.y + tile.height,
				tile.x,
				tile.y + tile.height,
				tile.x + tile.width,
				tile.y,
				tile.x + tile.width,
				tile.y + tile.height,
			]),
			gl.DYNAMIC_DRAW,
		);
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.bindTexture(gl.TEXTURE_2D, tile.texture);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	/** 翻页拖拽渲染：当前图与邻图并排，整体随手指位移 */
	private renderPagerFrame(): void {
		const pager = this.pager;
		if (!pager) return;
		const { gl } = this;
		try {
			if (gl.isContextLost()) return;
			if (!this.beginFrame()) return;

			// 当前图：全分辨率纹理；加载期间用缩略图预览
			if (this.loaded) {
				if (this.useTiles) {
					gl.uniformMatrix3fv(
						this.matrixLocation,
						false,
						createTransformMatrix({
							scale: this.transform.scale,
							translateX: this.transform.translateX + pager.dx,
							translateY: this.transform.translateY,
						}),
					);
					for (const tile of this.tiles) {
						if (!tile.texture) continue;
						this.drawTileQuad(tile);
					}
				} else if (this.texture && this.image) {
					const dims = this.getSourceDimensions(this.image);
					if (dims) {
						this.drawQuad(
							this.texture,
							{ w: dims.width, h: dims.height },
							this.transform.scale,
							this.transform.translateX + pager.dx,
							this.transform.translateY,
						);
					}
				}
			} else if (this.preview) {
				this.drawQuad(
					this.preview.texture,
					this.preview.quad,
					1,
					this.preview.quad.tx + pager.dx,
					this.preview.quad.ty,
				);
			}

			// 邻图：一屏宽之外，随手指同步位移
			const asset = pager.src ? this.readyNeighbors.get(pager.src) : null;
			if (asset) {
				this.drawQuad(
					asset.texture,
					asset.quad,
					1,
					asset.quad.tx +
						pager.direction * this.canvas.width +
						pager.dx,
					asset.quad.ty,
				);
			}
		} catch (error) {
			console.error("WebGL viewer render error:", error);
		}
	}

	private updateAnimation(): void {
		if (!this.animation) return;

		const elapsed = Date.now() - this.animation.startTime;
		const progress = Math.min(elapsed / this.animation.duration, 1);

		if (progress >= 1 || this.animation.duration <= 0) {
			this.transform = { ...this.animation.targetTransform };
			this.animation = null;
			if (this.animationId !== null) {
				cancelAnimationFrame(this.animationId);
				this.animationId = null;
			}
			this.callbacks.onTransformChange?.({ ...this.transform });
			return;
		}

		const t = this.animation.easing(progress);
		const { startTransform, targetTransform } = this.animation;
		this.transform = {
			scale:
				startTransform.scale +
				(targetTransform.scale - startTransform.scale) * t,
			translateX:
				startTransform.translateX +
				(targetTransform.translateX - startTransform.translateX) * t,
			translateY:
				startTransform.translateY +
				(targetTransform.translateY - startTransform.translateY) * t,
		};
		this.callbacks.onTransformChange?.({ ...this.transform });

		this.animationId = requestAnimationFrame(() => this.render());
	}

	private animateTo(target: Transform): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		if (this.config.animationTime <= 0) {
			this.transform = { ...target };
			this.constrainToBounds();
			this.callbacks.onTransformChange?.({ ...this.transform });
			this.throttledRender();
			return;
		}

		this.animation = {
			startTime: Date.now(),
			duration: this.config.animationTime,
			startTransform: { ...this.transform },
			targetTransform: { ...target },
			easing: easeOutQuart,
		};
		this.render();
	}

	// ------------------------------------------------------------ 缩放

	public zoomIn(animate = true): void {
		this.zoomAtPoint(
			this.canvas.width / 2,
			this.canvas.height / 2,
			1 + this.config.wheelStep,
			animate,
		);
	}

	public zoomOut(animate = true): void {
		this.zoomAtPoint(
			this.canvas.width / 2,
			this.canvas.height / 2,
			1 - this.config.wheelStep,
			animate,
		);
	}

	public resetView(): void {
		if (!this.image) return;

		this.initialScale = this.getFitScale();
		const scale = this.clampScale(this.initialScale);
		const scaledWidth = this.image.width * scale;
		const scaledHeight = this.image.height * scale;
		this.animateTo({
			scale,
			translateX: (this.canvas.width - scaledWidth) / 2,
			translateY: (this.canvas.height - scaledHeight) / 2,
		});
	}

	private zoomAtPoint(
		x: number,
		y: number,
		scaleFactor: number,
		animate: boolean,
	): void {
		if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return;

		const newScale = this.clampScale(this.transform.scale * scaleFactor);
		if (newScale === this.transform.scale) return;

		const imageX = (x - this.transform.translateX) / this.transform.scale;
		const imageY = (y - this.transform.translateY) / this.transform.scale;
		const target: Transform = {
			scale: newScale,
			translateX: x - imageX * newScale,
			translateY: y - imageY * newScale,
		};

		if (animate) {
			this.animateTo(target);
			return;
		}

		this.transform = target;
		this.constrainToBounds();
		this.callbacks.onTransformChange?.({ ...this.transform });
		this.throttledRender();
	}

	// ------------------------------------------------------------ 交互

	private clientToCanvas(
		clientX: number,
		clientY: number,
	): {
		x: number;
		y: number;
	} {
		const rect = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		return {
			x: (clientX - rect.left) * dpr,
			y: (clientY - rect.top) * dpr,
		};
	}

	private onMouseDown = (event: MouseEvent): void => {
		this.isDragging = true;
		this.lastMousePos = { x: event.clientX, y: event.clientY };
		this.canvas.style.cursor = "grabbing";
		this.addListener(document, "mousemove", this.onMouseMove);
		this.addListener(document, "mouseup", this.onMouseUp);
		event.preventDefault();
	};

	private onMouseMove = (event: MouseEvent): void => {
		if (!this.isDragging || !this.lastMousePos) return;

		const dpr = window.devicePixelRatio || 1;
		this.transform.translateX += (event.clientX - this.lastMousePos.x) * dpr;
		this.transform.translateY += (event.clientY - this.lastMousePos.y) * dpr;
		this.constrainToBounds();
		this.lastMousePos = { x: event.clientX, y: event.clientY };
		this.callbacks.onTransformChange?.({ ...this.transform });
		this.throttledRender();
		event.preventDefault();
	};

	private onMouseUp = (): void => {
		this.isDragging = false;
		this.lastMousePos = null;
		this.canvas.style.cursor = "grab";
		this.removeListener(document, "mousemove", this.onMouseMove);
		this.removeListener(document, "mouseup", this.onMouseUp);
	};

	private onWheel = (event: WheelEvent): void => {
		event.preventDefault();
		const point = this.clientToCanvas(event.clientX, event.clientY);
		const factor =
			event.deltaY < 0 ? 1 + this.config.wheelStep : 1 - this.config.wheelStep;
		this.zoomAtPoint(point.x, point.y, factor, false);
	};

	private onClick = (event: MouseEvent): void => {
		const now = Date.now();
		if (now - this.lastClickTime < RENDER_CONFIG.DOUBLE_CLICK_DELAY) {
			const point = this.clientToCanvas(event.clientX, event.clientY);
			const zoomedIn = this.transform.scale > this.initialScale * 1.1;
			if (zoomedIn) {
				this.resetView();
			} else {
				this.zoomAtPoint(point.x, point.y, this.config.doubleClickStep, true);
			}
			this.lastClickTime = 0;
			return;
		}
		this.lastClickTime = now;
	};

	private onTouchStart = (event: TouchEvent): void => {
		event.preventDefault();
		if (this.pager?.animating) {
			// 吸附动画中新的触摸：立即结算到目标页，本次触摸作为新手势
			this.finishPagerAnimation();
		}
		if (this.pager) return;

		if (event.touches.length === 1) {
			this.hasMoved = false;
			this.isDragging = true;
			const touch = event.touches[0];
			if (touch) {
				this.lastMousePos = { x: touch.clientX, y: touch.clientY };
				// 手势序列起点：仅在尚未记录时设置（抬指后清空）
				if (!this.touchGestureStart) {
					this.touchGestureStart = { x: touch.clientX, y: touch.clientY };
				}
			}
		} else if (event.touches.length === 2) {
			const [a, b] = [event.touches[0], event.touches[1]];
			if (!a || !b) return;
			this.isDragging = false;
			this.lastMousePos = null;
			this.touchGesturePinched = true;
			this.touchState = {
				lastDistance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
			};
		}
	};

	private onTouchMove = (event: TouchEvent): void => {
		event.preventDefault();

		if (event.touches.length === 1 && this.isDragging && this.lastMousePos) {
			const touch = event.touches[0];
			if (!touch) return;
			const dpr = window.devicePixelRatio || 1;
			const deltaX = (touch.clientX - this.lastMousePos.x) * dpr;
			const deltaY = (touch.clientY - this.lastMousePos.y) * dpr;
			if (Math.abs(deltaX) > 5 * dpr || Math.abs(deltaY) > 5 * dpr) {
				this.hasMoved = true;
			}
			// 未放大时横向拖动进入翻页跟手模式（无 Worker 时退回滑动切换）
			if (
				!this.pager &&
				this.worker &&
				this.touchGestureStart &&
				this.getRelativeScale() <= 1.02
			) {
				const totalDx = touch.clientX - this.touchGestureStart.x;
				const totalDy = touch.clientY - this.touchGestureStart.y;
				if (Math.abs(totalDx) > 8 && Math.abs(totalDx) > Math.abs(totalDy)) {
					this.startPager(totalDx > 0 ? -1 : 1);
				}
			}
			if (this.pager) {
				this.updatePager(touch);
				event.preventDefault();
				return;
			}
			this.transform.translateX += deltaX;
			this.transform.translateY += deltaY;
			this.constrainToBounds();
			this.lastMousePos = { x: touch.clientX, y: touch.clientY };
			this.callbacks.onTransformChange?.({ ...this.transform });
			this.throttledRender();
		} else if (event.touches.length === 2 && this.touchState) {
			const [a, b] = [event.touches[0], event.touches[1]];
			if (!a || !b) return;
			const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
			const center = this.clientToCanvas(
				(a.clientX + b.clientX) / 2,
				(a.clientY + b.clientY) / 2,
			);
			this.zoomAtPoint(
				center.x,
				center.y,
				distance / this.touchState.lastDistance,
				false,
			);
			this.touchState.lastDistance = distance;
		}
	};

	private onTouchEnd = (event: TouchEvent): void => {
		const now = Date.now();

		if (this.pager && event.touches.length === 0) {
			// 翻页拖拽结束：按距离/速度吸附到提交或回弹
			this.resolvePager();
		} else if (event.touches.length === 0 && this.lastMousePos && !this.hasMoved) {
			const position = this.lastMousePos;
			if (
				this.lastTouchTime > 0 &&
				now - this.lastTouchTime < RENDER_CONFIG.DOUBLE_CLICK_DELAY &&
				this.lastTouchPosition &&
				Math.hypot(
					position.x - this.lastTouchPosition.x,
					position.y - this.lastTouchPosition.y,
				) < 50
			) {
				const rect = this.canvas.getBoundingClientRect();
				const dpr = window.devicePixelRatio || 1;
				const centerX = (position.x - rect.left) * dpr;
				const centerY = (position.y - rect.top) * dpr;
				const zoomedIn = this.transform.scale > this.initialScale * 1.1;
				if (zoomedIn) {
					this.resetView();
				} else {
					this.zoomAtPoint(centerX, centerY, this.config.doubleClickStep, true);
				}
				this.lastTouchTime = 0;
				this.lastTouchPosition = null;
			} else {
				this.lastTouchTime = now;
				this.lastTouchPosition = position;
			}
		} else {
			// 移动或多指结束：复位双击检测
			this.lastTouchTime = 0;
			this.lastTouchPosition = null;
			if (
				event.touches.length === 0 &&
				this.hasMoved &&
				!this.touchGesturePinched &&
				!this.pager
			) {
				this.detectSwipe();
			}
		}

		this.isDragging = false;
		this.lastMousePos = null;
		this.touchState = null;
		this.hasMoved = false;
		if (event.touches.length === 0) {
			this.touchGestureStart = null;
			this.touchGesturePinched = false;
		}
	};

	/**
	 * 未放大（图片适配视口）时的单指横向滑动切换。
	 * 放大状态下单指拖拽用于平移，不触发切换；手势中出现双指缩放同样跳过。
	 */
	private detectSwipe(): void {
		const start = this.touchGestureStart;
		const end = this.lastMousePos;
		if (!start || !end) return;
		if (this.getRelativeScale() > 1.02) return;

		const dx = end.x - start.x;
		const dy = end.y - start.y;
		if (
			Math.abs(dx) < RENDER_CONFIG.SWIPE_DISTANCE_PX ||
			Math.abs(dx) <= Math.abs(dy) * RENDER_CONFIG.SWIPE_AXIS_RATIO
		) {
			return;
		}
		this.callbacks.onSwipe?.(dx < 0 ? "left" : "right");
	}

	// ------------------------------------------------------------ 翻页拖拽（跟手）

	/** 激活翻页拖拽：邻图纹理已预热，通常立即可用 */
	private startPager(direction: 1 | -1): void {
		if (!this.worker) return;
		const src =
			direction === 1 ? this.neighborSrcs.next : this.neighborSrcs.prev;
		this.pager = {
			direction: src ? direction : 0,
			dx: 0,
			src,
			requestId: ++this.pagerRequestCounter,
			animating: false,
			target: 0,
			history: [],
		};
		if (src && !this.readyNeighbors.has(src)) {
			this.requestNeighborDecode(src);
		}
	}

	/** 图片跟手：当前图与邻图并排，位移 = 手指位移（端点处阻尼） */
	private updatePager(touch: Touch): void {
		const pager = this.pager;
		if (!pager || !this.touchGestureStart) return;
		const dpr = window.devicePixelRatio || 1;
		let dx = (touch.clientX - this.touchGestureStart.x) * dpr;
		if (pager.direction === 0) dx *= 0.35;
		pager.dx = dx;
		pager.history.push({ dx, t: Date.now() });
		if (pager.history.length > 8) pager.history.shift();
		this.render();
	}

	/**
	 * 松手结算：按手势提交（位移超屏宽 20%，或最近 100ms 采样窗口内的轻扫速度），
	 * 否则回弹。邻图纹理未就绪（快速轻扫早于解码完成）也允许提交——
	 * 宿主会走普通切换路径补加载。
	 */
	private resolvePager(): void {
		const pager = this.pager;
		if (!pager) return;
		let target = 0;
		if (pager.direction !== 0) {
			const width = this.canvas.width;
			const velocity = this.flickVelocity(pager);
			const distanceOk = Math.abs(pager.dx) > width * 0.2;
			const flick =
				Math.abs(velocity) > 0.5 * (window.devicePixelRatio || 1) &&
				Math.sign(velocity) === -pager.direction;
			target = distanceOk || flick ? -pager.direction * width : 0;
		}
		this.animatePagerTo(target, {
			duration: 300,
			easing: easeOutQuart,
		});
	}

	/** 最近 ~100ms 采样窗口内的平均速度（设备 px/ms），抗抬指前末段减速的噪声 */
	private flickVelocity(pager: PagerState): number {
		const history = pager.history;
		if (history.length < 2) return 0;
		const last = history[history.length - 1];
		let ref = history[0];
		for (const sample of history) {
			if (last.t - sample.t <= 100) {
				ref = sample;
				break;
			}
		}
		return (last.dx - ref.dx) / Math.max(1, last.t - ref.t);
	}

	private animatePagerTo(
		target: number,
		options: { duration: number; easing: (t: number) => number },
	): void {
		const pager = this.pager;
		if (!pager) return;
		pager.animating = true;
		pager.target = target;
		const startDx = pager.dx;
		const startTime = Date.now();
		// reduced-motion 时立即到位
		const duration =
			this.config.animationTime === 0 ? 0 : options.duration;
		if (duration <= 0) {
			pager.dx = target;
			pager.animating = false;
			this.settlePager();
			return;
		}
		const step = () => {
			if (this.pager !== pager || !pager.animating) return;
			const t = Math.min((Date.now() - startTime) / duration, 1);
			pager.dx = startDx + (target - startDx) * options.easing(t);
			this.render();
			if (t < 1) {
				this.pagerRafId = requestAnimationFrame(step);
				return;
			}
			this.pagerRafId = null;
			pager.animating = false;
			this.settlePager();
		};
		step();
	}

	/** 吸附动画期间被新触摸打断：立即结算到目标状态 */
	private finishPagerAnimation(): void {
		const pager = this.pager;
		if (!pager) return;
		if (this.pagerRafId !== null) {
			cancelAnimationFrame(this.pagerRafId);
			this.pagerRafId = null;
		}
		pager.animating = false;
		pager.dx = pager.target;
		this.settlePager();
	}

	private cancelPager(): void {
		if (this.pagerRafId !== null) {
			cancelAnimationFrame(this.pagerRafId);
			this.pagerRafId = null;
		}
		this.pager = null;
	}

	/** 提交换页：邻图纹理升级为当前画面，通知宿主更新索引并补元数据 */
	private settlePager(): void {
		const pager = this.pager;
		if (!pager) return;
		if (pager.target !== 0) {
			const asset = pager.src ? this.readyNeighbors.get(pager.src) : null;
			if (asset) {
				// 邻图已就绪：无缝升级为当前画面
				this.commitPager();
				return;
			}
			// 邻图纹理未就绪（预热尚未完成）：按普通切换处理（宿主补加载）
			const direction = pager.direction;
			this.pager = null;
			if (direction !== 0) {
				this.callbacks.onPageChange?.(direction === 1 ? 1 : -1, false);
			}
			return;
		}
		this.pager = null;
		this.render();
	}

	private commitPager(): void {
		const pager = this.pager;
		if (!pager || !pager.src) return;
		const direction = pager.direction;
		const incoming = this.readyNeighbors.get(pager.src);

		// 让位的当前画面留作反方向资产：紧接着回滑也有画面，消除黑屏窗口
		// （仅限非瓦片路径的整幅纹理；瓦片图交给缩略图/解码兜底）
		const outgoingSrc =
			direction === 1 ? this.neighborSrcs.prev : this.neighborSrcs.next;
		let keptOutgoing = false;
		if (this.texture && this.image && !this.useTiles && outgoingSrc) {
			const dims = this.getSourceDimensions(this.image);
			const scale = this.transform.scale;
			if (dims && scale > 0) {
				const quadW = Math.round(dims.width * scale);
				const quadH = Math.round(dims.height * scale);
				const previous = this.readyNeighbors.get(outgoingSrc);
				if (previous) this.gl.deleteTexture(previous.texture);
				this.readyNeighbors.set(outgoingSrc, {
					texture: this.texture,
					quad: {
						w: quadW,
						h: quadH,
						tx: (this.canvas.width - quadW) / 2,
						ty: (this.canvas.height - quadH) / 2,
					},
					source: this.image,
					crisp: true,
					meta: { width: dims.width, height: dims.height },
				});
				keptOutgoing = true;
			}
		}

		if (incoming) {
			if (this.texture && !keptOutgoing) {
				this.gl.deleteTexture(this.texture);
			}
			this.texture = incoming.texture;
			this.useTiles = false;
			this.image = incoming.source;
			this.loaded = true;
			this.updatePositionBuffer();
			this.centerImage();
			this.readyNeighbors.delete(pager.src);
		}
		this.pager = null;
		// 先换页（宿主重置索引/元数据），再补送邻图元数据
		this.callbacks.onPageChange?.(direction === 1 ? 1 : -1, Boolean(incoming));
		if (incoming?.meta) this.callbacks.onMetadata?.(incoming.meta);
	}

	/** 邻图解码完成：以更清晰的降采样纹理覆盖缩略图预热纹理 */
	private applyNeighborBitmap(payload: {
		bitmap: ImageBitmap;
		requestId: number;
		exif?: ExifSummary;
		histogram?: HistogramData;
		fileSize?: number;
	}): void {
		const src = this.neighborRequests.get(payload.requestId);
		this.neighborRequests.delete(payload.requestId);
		if (!src) {
			payload.bitmap.close();
			return;
		}
		// 该 src 已是当前画面（翻页提交后）：解码结果与静默刷新重复，直接丢弃
		if (this.loaded && this.lastRequestedSrc === src) {
			payload.bitmap.close();
			return;
		}
		const built = this.uploadFittedTexture(
			payload.bitmap,
			payload.bitmap.width,
			payload.bitmap.height,
		);
		payload.bitmap.close();
		if (!built) return;
		const existing = this.readyNeighbors.get(src);
		if (existing) this.gl.deleteTexture(existing.texture);
		this.readyNeighbors.set(src, {
			texture: built.texture,
			quad: built.quad,
			source: built.resized,
			meta: {
				exif: payload.exif,
				histogram: payload.histogram,
				fileSize: payload.fileSize,
				width: payload.bitmap.width,
				height: payload.bitmap.height,
			},
			crisp: true,
		});
		this.render();
	}

	private onContextLost = (event: Event): void => {
		event.preventDefault();
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		this.animation = null;
		this.isDragging = false;
		this.lastMousePos = null;
		this.touchState = null;
	};

	private onContextRestored = (): void => {
		try {
			this.setupWebGL();
			if (this.image && this.loaded) {
				let usingTiles = this.useTiles;
				if (usingTiles) {
					usingTiles = this.createTiles(this.image);
				}
				if (!usingTiles && this.createTexture(this.image) === null) {
					console.error("Failed to restore WebGL viewer after context loss");
					return;
				}
				this.useTiles = usingTiles && this.tiles.length > 0;
				this.render();
			}
		} catch (error) {
			console.error("Failed to restore WebGL context:", error);
		}
	};

	private removeListener<T extends Event>(
		target: EventTarget,
		type: string,
		handler: (event: T) => void,
	): void {
		const listener = handler as EventListener;
		target.removeEventListener(type, listener);
		this.boundHandlers = this.boundHandlers.filter(
			([t, ty, h]) => !(t === target && ty === type && h === listener),
		);
	}

	// ------------------------------------------------------------ 销毁

	public destroy(): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		if (this.resizeFrameId !== null) {
			cancelAnimationFrame(this.resizeFrameId);
			this.resizeFrameId = null;
		}

		for (const [target, type, handler] of this.boundHandlers) {
			target.removeEventListener(type, handler);
		}
		this.boundHandlers = [];

		const { gl } = this;
		if (this.texture) {
			gl.deleteTexture(this.texture);
			this.texture = null;
		}
		this.cleanupTiles();
		this.useTiles = false;
		if (this.positionBuffer) {
			gl.deleteBuffer(this.positionBuffer);
			this.positionBuffer = null;
		}
		if (this.texCoordBuffer) {
			gl.deleteBuffer(this.texCoordBuffer);
			this.texCoordBuffer = null;
		}
		if (this.program) {
			gl.deleteProgram(this.program);
			this.program = null;
		}

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this.cancelPager();
		for (const asset of this.readyNeighbors.values()) {
			this.gl.deleteTexture(asset.texture);
		}
		this.readyNeighbors.clear();
		this.clearPreview();
		this.animation = null;
		this.image = null;
		this.loaded = false;

		this.worker?.terminate();
		this.worker = null;
	}
}

/** 由 scale/translate 构造 3×3 仿射矩阵（列主序） */
function createTransformMatrix(transform: Transform): Float32Array {
	const { scale, translateX, translateY } = transform;
	return new Float32Array([
		scale,
		0,
		0,
		0,
		scale,
		0,
		translateX,
		translateY,
		1,
	]);
}
